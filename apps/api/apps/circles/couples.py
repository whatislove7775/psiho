"""Private couples appointments. One payer, two independent consenting clients, no public discovery."""
import hashlib
import secrets
from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, serializers
from rest_framework.response import Response
from rest_framework.views import APIView
from apps.availability import services as availability
from apps.billing.ledger import InsufficientFunds
from apps.billing import services as billing
from apps.users.models import PsychologistProfile, User
from .models import Circle, Meeting, Membership, Charge
from . import services as svc, payloads as P
from .views import JoinThrottle, err


def digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


class BookSerializer(serializers.Serializer):
    psychologist_id = serializers.IntegerField(min_value=1)
    scheduled_at = serializers.DateTimeField()
    expected_price_rub = serializers.IntegerField(min_value=500, max_value=60000)
    expected_minutes = serializers.ChoiceField(choices=(60, 80, 90, 120))


@transaction.atomic
def book(user, profile_id, start, *, expected_price_rub=None, expected_minutes=None):
    if user.role != "client":
        raise svc.CircleError("Записать пару можно из кабинета клиента.", "not_client", 403)
    profile = PsychologistProfile.objects.select_for_update().filter(
        pk=profile_id, verification_status="approved", user__is_active=True).first()
    if profile is None:
        raise svc.CircleError("Специалист сейчас не принимает.", "not_found", 404)
    settings = availability.get_settings(profile)
    if ((expected_price_rub is not None and expected_price_rub != settings.couples_price_rub)
            or (expected_minutes is not None and expected_minutes != settings.couples_minutes)):
        raise svc.CircleError("Цена или длительность встречи изменились. Обновите карточку специалиста и подтвердите новые условия.", "quote_changed", 409)
    error = availability.check_bookable(profile, start, settings.couples_minutes, client=user, couples=True)
    if error:
        raise svc.CircleError(error, "unavailable")
    circle = Circle.objects.create(
        host=profile, booked_by=user, kind="couple", topic="relationships", title="Консультация для пары",
        description="Закрытая встреча двух партнёров с психологом. Каждый входит со своего аккаунта. Личные диалоги остаются отдельными.",
        rules="Участвуйте добровольно.\nНе записывайте разговор.\nНе передавайте приглашение посторонним.",
        format="single", billing="per_meeting", capacity=2, meeting_minutes=settings.couples_minutes,
        price_kopecks=settings.couples_price_rub * 100, status=Circle.Status.RECRUITING,
        chat_retention="24h")
    Meeting.objects.create(circle=circle, index=1, starts_at=start)
    svc.join(circle, user)  # Entire appointment held once; insufficient funds rolls everything back.
    return circle


@transaction.atomic
def invite(circle, user):
    circle = Circle.objects.select_for_update().get(pk=circle.pk)
    if circle.kind != "couple" or circle.booked_by_id != user.pk:
        raise svc.CircleError("Пригласить партнёра может тот, кто записал пару.", "forbidden", 403)
    if circle.status != Circle.Status.RECRUITING or not circle.meetings.filter(starts_at__gt=timezone.now()).exists():
        raise svc.CircleError("Приглашение для этой встречи уже недоступно.", "closed", 409)
    if circle.memberships.exclude(user=user).exists():
        raise svc.CircleError("Партнёр уже принял приглашение.", "claimed", 409)
    token = secrets.token_urlsafe(32)
    circle.partner_invite_hash = digest(token)
    circle.save(update_fields=["partner_invite_hash"])
    return token


def invitation(token, *, lock=False):
    if not isinstance(token, str) or not 32 <= len(token) <= 64:
        raise svc.CircleError("Приглашение недействительно или уже принято.", "not_found", 404)
    qs = Circle.objects.select_related("host", "host__user").filter(kind="couple", partner_invite_hash=digest(token), status="recruiting")
    if lock:
        qs = qs.select_for_update(of=("self",))
    circle = qs.first()
    if circle is None or not circle.meetings.filter(starts_at__gt=timezone.now()).exists():
        raise svc.CircleError("Приглашение недействительно или уже принято.", "not_found", 404)
    return circle


@transaction.atomic
def accept(user, token):
    # Serialize concurrent invitation claims by the same partner before checking their calendar.
    User.objects.select_for_update().get(pk=user.pk)
    circle = invitation(token, lock=True)
    if user.role != "client" or user.pk == circle.booked_by_id:
        raise svc.CircleError("Приглашение должен принять партнёр со своего аккаунта клиента.", "not_partner", 400)
    if circle.memberships.count() != 1:
        raise svc.CircleError("Встреча уже заполнена.", "claimed", 409)
    meeting = circle.meetings.get(index=1)
    from apps.sessions.models import ConsultationSession
    if (availability.busy_intervals(ConsultationSession.objects.filter(client=user), meeting.starts_at, meeting.ends_at)
            or availability.meeting_busy(None, meeting.starts_at, meeting.ends_at, client=user)):
        raise svc.CircleError("У вас уже есть встреча в это время.", "conflict", 409)
    name, tone = svc.pick_pseudonym(circle)
    Membership.objects.create(circle=circle, user=user, pseudonym=name, tone=tone)
    circle.partner_invite_hash = ""
    circle.save(update_fields=["partner_invite_hash"])
    return circle


@transaction.atomic
def cancel(circle, user):
    circle = Circle.objects.select_for_update().get(pk=circle.pk)
    if circle.kind != "couple":
        raise svc.CircleError("Встреча не найдена.", "not_found", 404)
    host = circle.host.user_id == user.pk
    if not host and not circle.memberships.filter(user=user, status="active").exists():
        raise svc.CircleError("Встреча не найдена.", "not_found", 404)
    meetings = list(circle.meetings.select_for_update())
    if circle.status in ("cancelled", "finished"):
        return circle
    if any(m.starts_at <= timezone.now() for m in meetings):
        raise svc.CircleError("Встреча уже началась. Можно выйти из комнаты; для отмены обратитесь в поддержку.", "started", 409)
    for charge in Charge.objects.filter(membership__circle=circle):
        billing.release_for_call(charge.ref, "specialist_cancel" if host else "client_cancel")
    circle.status = "cancelled"
    circle.partner_invite_hash = ""
    circle.save(update_fields=["status", "partner_invite_hash", "updated_at"])
    circle.meetings.update(status="cancelled")
    return circle


class BookView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [JoinThrottle]
    def post(self, request):
        ser = BookSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            circle = book(request.user, ser.validated_data["psychologist_id"], ser.validated_data["scheduled_at"],
                          expected_price_rub=ser.validated_data["expected_price_rub"],
                          expected_minutes=ser.validated_data["expected_minutes"])
        except svc.CircleError as e:
            return err(e)
        except InsufficientFunds:
            return Response({"detail": "На балансе не хватает денег для встречи. Пополните баланс и запишитесь снова.", "code": "insufficient_funds"}, status=402)
        return Response(P.circle_detail(circle, request.user), status=201)


class InviteView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [JoinThrottle]
    def post(self, request, pk):
        circle = Circle.objects.filter(pk=pk, kind="couple", booked_by=request.user).first()
        if circle is None:
            return Response({"detail": "Встреча не найдена."}, status=404)
        try:
            token = invite(circle, request.user)
        except svc.CircleError as e:
            return err(e)
        return Response({"token": token})


class PreviewView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [JoinThrottle]
    def post(self, request):
        try:
            circle = invitation(request.data.get("token"))
        except svc.CircleError as e:
            return err(e)
        # No membership names, conversation history, payer identity or internal identifiers.
        meeting = circle.meetings.get(index=1)
        return Response({"host": P.host_payload(circle), "starts_at": meeting.starts_at.isoformat(),
                         "minutes": circle.meeting_minutes, "paid": True})


class AcceptView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [JoinThrottle]
    def post(self, request):
        if request.data.get("consent") is not True:
            return Response({"detail": "Подтвердите добровольное участие в общей встрече."}, status=400)
        try:
            circle = accept(request.user, request.data.get("token"))
        except svc.CircleError as e:
            return err(e)
        return Response(P.circle_detail(circle, request.user), status=201)


class CancelView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    def post(self, request, pk):
        circle = Circle.objects.filter(pk=pk, kind="couple").first()
        if circle is None:
            return Response({"detail": "Встреча не найдена."}, status=404)
        try:
            circle = cancel(circle, request.user)
        except svc.CircleError as e:
            return err(e)
        return Response(P.circle_detail(circle, request.user))
