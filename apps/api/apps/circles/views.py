"""
«Круги».

Клиенты и все   /api/v1/circles/…              список, страница круга, запись/выход, чат, вход во встречу
Ведущий         /api/v1/circles/pro/…          создание, правка, отправка на проверку, модерация, отмена
Персонал        /api/v1/staff/circles/…        очередь проверки (specialists.verify)
"""
from datetime import datetime, timedelta

from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from apps.billing.ledger import InsufficientFunds, balance_of
from apps.billing.models import Account
from apps.staff.audit import audit
from apps.staff.permissions import StaffPerm
from apps.staff.throttles import STAFF_THROTTLES
from apps.users.permissions import IsPsychologist

from . import payloads as P
from . import services as svc
from .models import Circle, CircleMessage, Meeting, Membership

S = Circle.Status
M = Membership.Status


def err(e: svc.CircleError) -> Response:
    return Response({"detail": e.message, "code": e.code, **e.extra}, status=e.http)


class JoinThrottle(UserRateThrottle):
    scope = "circle_join"
    rate = "30/hour"


class ChatThrottle(UserRateThrottle):
    scope = "circle_chat"
    rate = "240/hour"


def _public_circle(pk) -> Circle:
    return get_object_or_404(Circle.objects.select_related("host", "host__user"), pk=pk, status__in=Circle.PUBLIC)


# ── Публично и для клиентов ───────────────────────────────────────────

class CircleListView(APIView):
    """GET — открытые круги (набор и идущие), ?topic=anxiety."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        svc.maybe_sweep()
        qs = Circle.objects.select_related("host", "host__user").filter(status__in=[S.RECRUITING, S.RUNNING])
        topic = request.query_params.get("topic")
        if topic in Circle.Topic.values:
            qs = qs.filter(topic=topic)
        now = timezone.now()
        items = [P.circle_card(c, now) for c in qs]
        # сначала те, куда можно записаться, потом по ближайшей встрече
        items.sort(key=lambda x: (x["status"] != "recruiting", x["next_meeting_at"] or "9999"))
        counts = dict(
            Circle.objects.filter(status__in=[S.RECRUITING, S.RUNNING]).values_list("topic").annotate(n=Count("id"))
        )
        topics = [{"id": v, "label": label, "count": counts.get(v, 0)} for v, label in Circle.Topic.choices]
        return Response({"results": items, "topics": topics})


class MyCirclesView(APIView):
    """GET — мои круги: участие (клиент) или ведение (специалист)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        svc.maybe_sweep()
        now = timezone.now()
        rows = []
        for m in Membership.objects.filter(user=request.user, status__in=[M.ACTIVE, M.WAITLIST]).select_related(
                "circle", "circle__host"):
            card = P.circle_card(m.circle, now)
            nxt = svc.active_meetings(m.circle).filter(status__in=["scheduled", "live"]).filter(
                starts_at__gt=now - timedelta(minutes=m.circle.meeting_minutes + 15)).first()
            card["me"] = {"status": m.status, "pseudonym": m.pseudonym, "tone": m.tone,
                          "waitlist_position": svc.waitlist_position(m)}
            card["next_meeting"] = P.meeting_payload(nxt, now) if nxt else None
            rows.append(card)
        rows.sort(key=lambda x: x["next_meeting"]["starts_at"] if x["next_meeting"] else "9999")
        return Response({"results": rows})


class CircleDetailView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        c = get_object_or_404(Circle.objects.select_related("host", "host__user"), pk=pk)
        is_host = request.user.is_authenticated and c.host.user_id == request.user.pk
        is_member = request.user.is_authenticated and c.memberships.filter(user=request.user).exists()
        if not c.is_public and c.status != S.CANCELLED and not is_host:
            return Response({"detail": "Круг не найден."}, status=404)
        if c.status == S.CANCELLED and not (is_host or is_member):
            return Response({"detail": "Круг не найден."}, status=404)
        svc.refresh_status(c)
        return Response(P.circle_detail(c, request.user))


class JoinView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [JoinThrottle]

    def post(self, request, pk):
        c = _public_circle(pk)
        try:
            m, waitlisted = svc.join(c, request.user)
        except svc.CircleError as e:
            return err(e)
        except InsufficientFunds:
            due = svc.amount_due(c)
            bal = balance_of(request.user, Account.Kind.CLIENT)
            return Response({
                "detail": "На балансе не хватает денег. Пополните баланс и запишитесь снова.",
                "code": "insufficient_funds", "shortfall_kopecks": max(0, due - bal), "balance_kopecks": bal,
            }, status=status.HTTP_402_PAYMENT_REQUIRED)
        c.refresh_from_db()
        return Response({"waitlisted": waitlisted, "circle": P.circle_detail(c, request.user)},
                        status=status.HTTP_201_CREATED)


class LeaveView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        c = get_object_or_404(Circle, pk=pk)
        m = Membership.objects.filter(circle=c, user=request.user, status__in=[M.ACTIVE, M.WAITLIST]).first()
        if m is None:
            return Response({"detail": "Вы не записаны в этот круг."}, status=400)
        svc.leave(m)
        c.refresh_from_db()
        return Response(P.circle_detail(c, request.user))


def _audience(request, pk):
    c = get_object_or_404(Circle.objects.select_related("host", "host__user"), pk=pk)
    role, m = svc.chat_role(c, request.user)
    return c, role, m


class MembersView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        c, role, m = _audience(request, pk)
        if role is None:
            return Response({"detail": "Список доступен только участникам круга."}, status=403)
        return Response({"host": P.host_payload(c), "members": P.members_payload(c, role, m)})


class MessagesView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ChatThrottle]

    def get_throttles(self):
        return super().get_throttles() if self.request.method == "POST" else []

    def get(self, request, pk):
        c, role, m = _audience(request, pk)
        if role is None:
            return Response({"detail": "Чат круга доступен только участникам и ведущему."}, status=403)
        qs = svc.visible_messages(c)
        before = request.query_params.get("before")
        if before:
            try:
                qs = qs.filter(created_at__lt=datetime.fromisoformat(before))
            except ValueError:
                pass
        # Новый участник не читает переписку до своего прихода — только системные приветствия
        if m is not None:
            qs = qs.filter(Q(created_at__gte=m.joined_at) | Q(role=CircleMessage.Role.SYSTEM))
        items = list(qs.order_by("-created_at")[:60])[::-1]
        mid = m.pk if m else None
        return Response({
            "results": [svc.serialize_message(x, mid) for x in items],
            "my_role": role,
            "me": {"handle": m.handle, "name": m.pseudonym, "tone": m.tone, "chat_muted": m.chat_muted} if m else None,
            "writable": svc.chat_writable(c) and not (m and m.chat_muted),
            "retention": c.chat_retention,
        })

    def post(self, request, pk):
        c, role, m = _audience(request, pk)
        try:
            msg = svc.post_message(c, request.user, str(request.data.get("text") or ""))
        except svc.CircleError as e:
            return err(e)
        return Response(svc.serialize_message(msg, m.pk if m else None), status=201)


class MessageDeleteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk, mid):
        msg = get_object_or_404(CircleMessage.objects.select_related("circle", "circle__host"), pk=mid, circle_id=pk)
        try:
            svc.delete_message(msg, request.user)
        except svc.CircleError as e:
            return err(e)
        return Response(status=204)


class MeetingJoinView(APIView):
    """POST — войти во встречу: токен групповой комнаты сигналинга."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, mid):
        from apps.signaling.group import make_group_token

        meeting = get_object_or_404(Meeting.objects.select_related("circle", "circle__host", "circle__host__user"), pk=mid)
        c = meeting.circle
        role, m = svc.chat_role(c, request.user)
        if role is None:
            return Response({"detail": "Эта встреча только для участников круга."}, status=403)
        reason = svc.room_open(meeting)
        if reason:
            return Response({"detail": reason, "code": "room_closed", "meeting": P.meeting_payload(meeting)}, status=409)
        if role == "host":
            svc.mark_host_joined(meeting)
            peer, name, tone = "host", c.host.display_name, "primary"
        else:
            peer, name, tone = m.handle, m.pseudonym, m.tone
        token = make_group_token(user_id=request.user.pk, room_id=meeting.room_id, peer=peer, role=role,
                                 circle_id=c.id, meeting_id=meeting.id)
        return Response({
            "ws_token": token,
            "room_id": str(meeting.room_id),
            "role": role,
            "self": {"id": peer, "name": name, "tone": tone},
            "circle": {"id": str(c.id), "title": c.title, "topic": c.topic, "topic_label": c.get_topic_display(),
                       "allow_real_faces": c.allow_real_faces},
            "meeting": P.meeting_payload(meeting),
            "host": P.host_payload(c),
            "max_peers": 1 + c.capacity,
        })


# ── Ведущий ───────────────────────────────────────────────────────────

class CircleWriteSerializer(serializers.Serializer):
    topic = serializers.ChoiceField(choices=Circle.Topic.choices)
    title = serializers.CharField(max_length=120, min_length=4)
    description = serializers.CharField(max_length=3000, min_length=40)
    rules = serializers.CharField(max_length=2000, required=False, allow_blank=True, default="")
    format = serializers.ChoiceField(choices=Circle.Format.choices)
    meeting_minutes = serializers.IntegerField(min_value=45, max_value=180)
    capacity = serializers.IntegerField(min_value=Circle.MIN_CAPACITY, max_value=Circle.MAX_CAPACITY)
    billing = serializers.ChoiceField(choices=Circle.Billing.choices)
    price_rub = serializers.IntegerField(min_value=svc.PRICE_MIN_RUB, max_value=svc.PRICE_MAX_RUB)
    first_meeting_at = serializers.DateTimeField()
    meetings_count = serializers.IntegerField(min_value=1, max_value=svc.MAX_MEETINGS)
    allow_real_faces = serializers.BooleanField(required=False, default=False)
    chat_retention = serializers.ChoiceField(choices=Circle.Retention.choices, required=False, default="forever")

    def validate(self, attrs):
        if attrs["format"] == Circle.Format.SINGLE:
            attrs["meetings_count"] = 1
            attrs["billing"] = Circle.Billing.PER_MEETING
        elif attrs["meetings_count"] < 2:
            raise serializers.ValidationError({"meetings_count": ["В цикле — от 2 до 12 встреч."]})
        if attrs["first_meeting_at"] <= timezone.now() + timedelta(hours=1):
            raise serializers.ValidationError({"first_meeting_at": ["Выберите время в будущем."]})
        if attrs["billing"] == Circle.Billing.PER_MEETING and attrs["price_rub"] > 10000:
            raise serializers.ValidationError({"price_rub": ["Цена одной встречи — до 10 000 ₽."]})
        return attrs


# Поля, которые можно менять после публикации (не влияют на деньги и расписание)
LIVE_EDITABLE = {"description", "rules", "allow_real_faces", "chat_retention"}


class LiveEditSerializer(serializers.Serializer):
    description = serializers.CharField(max_length=3000, min_length=40, required=False)
    rules = serializers.CharField(max_length=2000, required=False, allow_blank=True)
    allow_real_faces = serializers.BooleanField(required=False)
    chat_retention = serializers.ChoiceField(choices=Circle.Retention.choices, required=False)


def _apply(circle: Circle, d: dict) -> Circle:
    for f in ("topic", "title", "description", "rules", "format", "meeting_minutes", "capacity", "billing",
              "allow_real_faces", "chat_retention"):
        setattr(circle, f, d[f])
    circle.price_kopecks = d["price_rub"] * 100
    circle.save()
    svc.set_schedule(circle, d["first_meeting_at"], d["meetings_count"])
    return circle


def _own(request, pk) -> Circle:
    return get_object_or_404(Circle.objects.select_related("host", "host__user"), pk=pk,
                             host__user=request.user)


class ProCirclesView(APIView):
    permission_classes = [IsPsychologist]

    def get(self, request):
        svc.maybe_sweep()
        qs = Circle.objects.select_related("host", "host__user").filter(host__user=request.user)
        return Response({"results": [
            {**P.circle_card(c), "review_comment": c.review_comment, "members_count": svc.seats_taken(c),
             "waitlist_count": c.memberships.filter(status=M.WAITLIST).count()}
            for c in qs
        ]})

    def post(self, request):
        ser = CircleWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        c = _apply(Circle(host=request.user.psychologist_profile, price_kopecks=0), ser.validated_data)
        return Response(P.circle_owner(c), status=201)


class ProCircleView(APIView):
    permission_classes = [IsPsychologist]

    def get(self, request, pk):
        c = _own(request, pk)
        svc.refresh_status(c)
        return Response(P.circle_owner(c))

    def put(self, request, pk):
        c = _own(request, pk)
        if c.status in Circle.EDITABLE:
            ser = CircleWriteSerializer(data=request.data)
            ser.is_valid(raise_exception=True)
            _apply(c, ser.validated_data)
        elif c.status in (S.PENDING, S.RECRUITING, S.RUNNING):
            ser = LiveEditSerializer(data={k: v for k, v in request.data.items() if k in LIVE_EDITABLE})
            ser.is_valid(raise_exception=True)
            for k, v in ser.validated_data.items():
                setattr(c, k, v)
            c.save()
        else:
            return Response({"detail": "Закрытый круг изменить нельзя."}, status=400)
        return Response(P.circle_owner(c))

    def delete(self, request, pk):
        c = _own(request, pk)
        if c.status not in Circle.EDITABLE:
            return Response({"detail": "Удалить можно только черновик. Опубликованный круг можно отменить."}, status=400)
        c.delete()
        return Response(status=204)


class ProCircleActionView(APIView):
    """POST {action: submit | cancel, reason?}"""

    permission_classes = [IsPsychologist]

    def post(self, request, pk):
        c = _own(request, pk)
        action = request.data.get("action")
        try:
            if action == "submit":
                svc.submit(c)
            elif action == "cancel":
                if c.status == S.RUNNING:
                    return Response({"detail": "Круг уже идёт. Чтобы отменить его, напишите в поддержку — "
                                               "мы поможем вернуть деньги участникам."}, status=400)
                if c.status in Circle.EDITABLE or c.status == S.PENDING:
                    c.status = S.DRAFT
                    c.save(update_fields=["status", "updated_at"])
                else:
                    svc.cancel_circle(c, who="specialist", reason=str(request.data.get("reason") or ""))
            else:
                return Response({"detail": "Неизвестное действие."}, status=400)
        except svc.CircleError as e:
            return err(e)
        c.refresh_from_db()
        return Response(P.circle_owner(c))


class ProModerateView(APIView):
    """POST {action: mute | unmute | remove} — участник по handle."""

    permission_classes = [IsPsychologist]

    def post(self, request, pk, handle):
        c = _own(request, pk)
        m = get_object_or_404(Membership, circle=c, handle=handle, status=M.ACTIVE)
        action = request.data.get("action")
        if action in ("mute", "unmute"):
            m.chat_muted = action == "mute"
            m.save(update_fields=["chat_muted"])
        elif action == "remove":
            svc.remove_member(m, by=request.user)
        else:
            return Response({"detail": "Неизвестное действие."}, status=400)
        return Response({"members": P.members_payload(c, "host", None)})


class ProMeetingEndView(APIView):
    permission_classes = [IsPsychologist]

    def post(self, request, mid):
        meeting = get_object_or_404(Meeting.objects.select_related("circle"), pk=mid, circle__host__user=request.user)
        if meeting.host_joined_at is None:
            return Response({"detail": "Встреча ещё не начиналась."}, status=400)
        svc.end_meeting(meeting)
        return Response(P.meeting_payload(meeting))


# ── Персонал ──────────────────────────────────────────────────────────

class StaffCircleListView(APIView):
    throttle_classes = STAFF_THROTTLES

    def get_permissions(self):
        return [StaffPerm("specialists.verify")()]

    def get(self, request):
        st = request.query_params.get("status", "pending")
        qs = Circle.objects.select_related("host", "host__user")
        if st in S.values:
            qs = qs.filter(status=st)
        qs = qs.order_by("submitted_at" if st == "pending" else "-updated_at")[:100]
        counts = dict(Circle.objects.values_list("status").annotate(n=Count("id")))
        return Response({
            "results": [{**P.circle_card(c), "submitted_at": c.submitted_at.isoformat() if c.submitted_at else None}
                        for c in qs],
            "counts": {s: counts.get(s, 0) for s in S.values},
        })


class DecisionSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["approve", "reject", "cancel"])
    comment = serializers.CharField(max_length=2000, required=False, allow_blank=True, default="")

    def validate(self, attrs):
        if attrs["decision"] in ("reject", "cancel") and not attrs["comment"].strip():
            raise serializers.ValidationError({"comment": ["Напишите, что нужно исправить или почему круг отменён."]})
        return attrs


class StaffCircleDetailView(APIView):
    throttle_classes = STAFF_THROTTLES

    def get_permissions(self):
        return [StaffPerm("specialists.verify")()]

    def get(self, request, pk):
        c = get_object_or_404(Circle.objects.select_related("host", "host__user"), pk=pk)
        return Response(P.circle_staff(c))

    def post(self, request, pk):
        c = get_object_or_404(Circle.objects.select_related("host", "host__user"), pk=pk)
        ser = DecisionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        try:
            if d["decision"] == "cancel":
                svc.cancel_circle(c, by=request.user, who="staff", reason=d["comment"])
            else:
                svc.review(c, d["decision"], by=request.user, comment=d["comment"])
        except svc.CircleError as e:
            return err(e)
        audit(request, f"circles.{d['decision']}", target=("circle", str(c.pk), c.title), details={"status": c.status})
        return Response(P.circle_staff(c))
