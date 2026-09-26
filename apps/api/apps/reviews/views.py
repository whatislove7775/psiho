"""
Отзывы.

Публично      GET  /api/v1/psychologists/<pk>/reviews/?page=      сводка + список
Клиент        GET  /api/v1/reviews/eligibility/?psychologist=<pk>  можно ли оставить, мой отзыв
              POST /api/v1/reviews/                               создать или обновить свой отзыв
              PATCH/DELETE /api/v1/reviews/<id>/
Специалист    GET  /api/v1/reviews/about-me/                      отзывы о себе
              POST /api/v1/reviews/<id>/reply/                    ответ (один, можно поправить)
Жалоба        POST /api/v1/reports/ {target_type: "review", target_id: <id>}
Персонал      GET  /api/v1/staff/reviews/?status=reported|hidden|all
              POST /api/v1/staff/reviews/<id>/moderate/ {action: hide|restore|keep, note}
"""
from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from apps.staff.audit import audit
from apps.staff.models import Report
from apps.staff.permissions import StaffPerm
from apps.staff.throttles import STAFF_THROTTLES
from apps.users.models import PsychologistProfile, User
from apps.users.permissions import IsPsychologist

from . import services
from .models import TAGS, Review

R = Review.Status
PAGE_SIZE = 10
ACTIVE_REPORT = [Report.Status.OPEN, Report.Status.IN_REVIEW]


class ReviewWriteThrottle(UserRateThrottle):
    scope = "reviews_write"
    rate = "30/hour"

    def allow_request(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return super().allow_request(request, view)


class ReviewSerializer(serializers.Serializer):
    rating = serializers.IntegerField(min_value=1, max_value=5)
    text = serializers.CharField(max_length=2000, required=False, allow_blank=True, default="")
    tags = serializers.ListField(child=serializers.CharField(max_length=20), required=False, default=list, max_length=8)

    def validate_tags(self, value):
        out = []
        for t in value:
            if t not in TAGS:
                raise serializers.ValidationError("Неизвестная метка.")
            if t not in out:
                out.append(t)
        return out

    def validate_text(self, value):
        return value.strip()


def _public_profile(pk) -> PsychologistProfile:
    return get_object_or_404(
        PsychologistProfile, pk=pk, verification_status=PsychologistProfile.VerificationStatus.APPROVED,
        user__is_active=True,
    )


def _calls_map(reviews) -> dict:
    """{review_id: число созвонов} одним запросом."""
    from apps.sessions.models import ConsultationSession

    pairs = {(r.client_id, r.psychologist_id) for r in reviews}
    if not pairs:
        return {}
    q = Q()
    for c, p in pairs:
        q |= Q(client_id=c, psychologist_profile_id=p)
    counts = dict(
        ((row["client_id"], row["psychologist_profile_id"]), row["n"])
        for row in ConsultationSession.objects.filter(q, status=ConsultationSession.Status.COMPLETED)
        .exclude(billing_hold__status__in=["released", "refunded"])
        .values("client_id", "psychologist_profile_id").annotate(n=Count("id"))
    )
    return {r.id: counts.get((r.client_id, r.psychologist_id), 1) for r in reviews}


class PublicReviewsView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        profile = _public_profile(pk)
        qs = Review.objects.filter(psychologist=profile, status=R.PUBLISHED).order_by("-created_at", "-id")
        try:
            page = max(1, int(request.query_params.get("page", 1)))
        except ValueError:
            page = 1
        total = qs.count()
        pages = max(1, -(-total // PAGE_SIZE))
        items = list(qs[(min(page, pages) - 1) * PAGE_SIZE: min(page, pages) * PAGE_SIZE])
        calls = _calls_map(items)
        viewer = request.user if request.user.is_authenticated else None
        return Response({
            "summary": services.summary(profile),
            "count": total, "page": min(page, pages), "pages": pages,
            "results": [services.review_public(r, viewer=viewer, calls=calls[r.id]) for r in items],
        })


class EligibilityView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        raw = request.query_params.get("psychologist", "")
        if not raw.isdigit():
            return Response({"psychologist": ["Укажите специалиста."]}, status=400)
        profile = get_object_or_404(PsychologistProfile, pk=int(raw))
        mine = Review.objects.filter(psychologist=profile, client=request.user).first()
        calls = services.completed_calls(request.user, profile) if request.user.role == User.Role.CLIENT else 0
        return Response({
            "can_review": calls > 0,
            "completed_calls": calls,
            "review": services.review_own(mine) if mine else None,
            "tags": [{"key": k, "label": v} for k, v in TAGS.items()],
        })


def _require_client_with_calls(request, profile):
    if request.user.role != User.Role.CLIENT:
        return Response({"detail": "Отзывы оставляют только клиенты."}, status=403)
    if services.completed_calls(request.user, profile) < 1:
        return Response(
            {"detail": "Отзыв можно оставить после завершённого созвона с этим специалистом.",
             "code": "no_completed_calls"},
            status=403,
        )
    return None


class ReviewCreateView(APIView):
    """Создать отзыв; если он уже есть — обновить (один отзыв на специалиста)."""

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ReviewWriteThrottle]

    def post(self, request):
        raw = str(request.data.get("psychologist", ""))
        if not raw.isdigit():
            return Response({"psychologist": ["Укажите специалиста."]}, status=400)
        profile = get_object_or_404(PsychologistProfile, pk=int(raw))
        denied = _require_client_with_calls(request, profile)
        if denied:
            return denied
        ser = ReviewSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        with transaction.atomic():
            review = Review.objects.select_for_update().filter(psychologist=profile, client=request.user).first()
            created = review is None
            if created:
                review = Review(psychologist=profile, client=request.user)
            else:
                review.edited_at = timezone.now()
            review.rating = ser.validated_data["rating"]
            review.text = ser.validated_data["text"]
            review.tags = ser.validated_data["tags"]
            review.save()
        return Response(services.review_own(review), status=status.HTTP_201_CREATED if created else 200)


class ReviewDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ReviewWriteThrottle]

    def patch(self, request, pk):
        review = get_object_or_404(Review, pk=pk, client=request.user)
        denied = _require_client_with_calls(request, review.psychologist)
        if denied:
            return denied
        data = {"rating": review.rating, "text": review.text, "tags": review.tags, **request.data}
        ser = ReviewSerializer(data=data)
        ser.is_valid(raise_exception=True)
        review.rating = ser.validated_data["rating"]
        review.text = ser.validated_data["text"]
        review.tags = ser.validated_data["tags"]
        review.edited_at = timezone.now()
        review.save()
        return Response(services.review_own(review))

    def delete(self, request, pk):
        get_object_or_404(Review, pk=pk, client=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ReplySerializer(serializers.Serializer):
    text = serializers.CharField(max_length=1500)

    def validate_text(self, value):
        value = value.strip()
        if len(value) < 2:
            raise serializers.ValidationError("Напишите ответ.")
        return value


class AboutMeView(APIView):
    permission_classes = [IsPsychologist]

    def get(self, request):
        profile = request.user.psychologist_profile
        items = list(Review.objects.filter(psychologist=profile, status=R.PUBLISHED).order_by("-created_at")[:200])
        calls = _calls_map(items)
        return Response({
            "summary": services.summary(profile),
            "results": [{**services.review_public(r, calls=calls[r.id]), "can_reply": True} for r in items],
        })


class ReplyView(APIView):
    """Один ответ специалиста на отзыв; повторный POST правит тот же ответ."""

    permission_classes = [IsPsychologist]
    throttle_classes = [ReviewWriteThrottle]

    def post(self, request, pk):
        review = get_object_or_404(Review, pk=pk, psychologist=request.user.psychologist_profile, status=R.PUBLISHED)
        ser = ReplySerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        review.reply_text = ser.validated_data["text"]
        review.reply_at = review.reply_at or timezone.now()
        review.save(update_fields=["reply_text", "reply_at", "updated_at"])
        return Response(services.review_public(review))


# ── Персонал ──────────────────────────────────────────────────────────

def staff_row(r: Review, reports: list[Report]) -> dict:
    return {
        **services.review_public(r),
        "status": r.status,
        "hidden_reason": r.hidden_reason,
        "created_at": r.created_at.isoformat(),
        "author": {"id": str(r.client_id), "alias": r.client.alias},
        "specialist": {"id": r.psychologist_id, "display_name": r.psychologist.display_name},
        "reports": [
            {"id": x.id, "reason": x.reason, "reason_label": x.get_reason_display(), "comment": x.comment,
             "status": x.status, "created_at": x.created_at.isoformat()}
            for x in reports
        ],
    }


def review_reports(ids) -> dict:
    out: dict[str, list] = {}
    for rep in Report.objects.filter(target_type="review", target_message_id__in=[str(i) for i in ids]) \
            .order_by("-created_at"):
        out.setdefault(rep.target_message_id, []).append(rep)
    return out


class StaffReviewListView(APIView):
    throttle_classes = STAFF_THROTTLES

    def get_permissions(self):
        return [StaffPerm("reports.view")()]

    def get(self, request):
        st = request.query_params.get("status", "reported")
        reported_ids = set(
            int(x) for x in Report.objects.filter(target_type="review", status__in=ACTIVE_REPORT)
            .values_list("target_message_id", flat=True) if str(x).isdigit()
        )
        qs = Review.objects.select_related("client", "psychologist")
        if st == "reported":
            qs = qs.filter(id__in=reported_ids)
        elif st == "hidden":
            qs = qs.filter(status=R.HIDDEN)
        spec = request.query_params.get("specialist")
        if spec and spec.isdigit():
            qs = qs.filter(psychologist_id=int(spec))
        qs = qs.order_by("-created_at", "-id")
        try:
            page = max(1, int(request.query_params.get("page", 1)))
        except ValueError:
            page = 1
        total = qs.count()
        pages = max(1, -(-total // 20))
        page = min(page, pages)
        items = list(qs[(page - 1) * 20: page * 20])
        reps = review_reports([r.id for r in items])
        return Response({
            "count": total, "page": page, "pages": pages,
            "results": [staff_row(r, reps.get(str(r.id), [])) for r in items],
            "counts": {
                "reported": len(reported_ids),
                "hidden": Review.objects.filter(status=R.HIDDEN).count(),
                "all": Review.objects.count(),
            },
        })


class ModerateSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=["hide", "restore", "keep"])
    note = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")

    def validate(self, attrs):
        attrs["note"] = attrs["note"].strip()
        if attrs["action"] == "hide" and not attrs["note"]:
            raise serializers.ValidationError({"note": ["Укажите причину: автор отзыва её увидит."]})
        return attrs


class StaffReviewModerateView(APIView):
    """hide — скрыть (жалобы решены), restore — вернуть, keep — оставить (жалобы отклонены)."""

    throttle_classes = STAFF_THROTTLES

    def get_permissions(self):
        return [StaffPerm("reports.resolve")()]

    def post(self, request, pk):
        review = get_object_or_404(Review.objects.select_related("client", "psychologist"), pk=pk)
        ser = ModerateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        action, note = ser.validated_data["action"], ser.validated_data["note"]
        now = timezone.now()
        with transaction.atomic():
            if action == "hide":
                review.status = R.HIDDEN
                review.hidden_reason = note
                review.hidden_by = request.user
            elif action == "restore":
                review.status = R.PUBLISHED
                review.hidden_reason = ""
                review.hidden_by = None
            review.save(update_fields=["status", "hidden_reason", "hidden_by", "updated_at"])
            open_reports = Report.objects.filter(target_type="review", target_message_id=str(review.pk),
                                                 status__in=ACTIVE_REPORT)
            report_status = Report.Status.RESOLVED if action == "hide" else Report.Status.DISMISSED
            for rep in open_reports:
                rep.status = report_status
                rep.resolution_action = Report.Action.NONE
                rep.resolution_note = note or ("Отзыв скрыт" if action == "hide" else "Отзыв оставлен")
                rep.resolved_by = request.user
                rep.resolved_at = now
                rep.assignee = rep.assignee or request.user
                rep.save()
            audit(request, f"review.{action}", target=("review", review.pk, f"Отзыв №{review.pk} о {review.psychologist.display_name}"),
                  details={"note": note, "rating": review.rating, "specialist": review.psychologist_id})
        reps = review_reports([review.id])
        return Response(staff_row(review, reps.get(str(review.id), [])))
