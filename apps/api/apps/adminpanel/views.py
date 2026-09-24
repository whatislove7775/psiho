from django.db.models import Sum
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.sessions.models import ConsultationSession
from apps.sessions.serializers import SessionSerializer
from apps.sessions.stats import day_bounds_utc, month_start_utc
from apps.users.models import PsychologistProfile, User
from apps.users.permissions import IsPlatformAdmin
from apps.users.serializers import PsychologistAdminSerializer

S = ConsultationSession.Status
V = PsychologistProfile.VerificationStatus


class VerifySerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=[V.APPROVED, V.REJECTED, V.SUSPENDED])


class AdminPsychologistListView(APIView):
    permission_classes = [IsPlatformAdmin]

    def get(self, request):
        qs = PsychologistProfile.objects.select_related("user").order_by("-created_at")
        wanted = request.query_params.get("status")
        if wanted:
            if wanted not in V.values:
                return Response({"detail": "Неизвестный статус."}, status=400)
            qs = qs.filter(verification_status=wanted)
        return Response(PsychologistAdminSerializer(qs, many=True).data)


class AdminVerifyPsychologistView(APIView):
    permission_classes = [IsPlatformAdmin]

    def post(self, request, pk):
        profile = PsychologistProfile.objects.select_related("user").filter(pk=pk).first()
        if profile is None:
            return Response({"detail": "Специалист не найден."}, status=status.HTTP_404_NOT_FOUND)
        serializer = VerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile.verification_status = serializer.validated_data["status"]
        profile.verified_by = request.user
        profile.verified_at = timezone.now()
        profile.save(update_fields=["verification_status", "verified_by", "verified_at", "updated_at"])
        return Response(PsychologistAdminSerializer(profile).data)


class AdminStatsView(APIView):
    permission_classes = [IsPlatformAdmin]

    def get(self, request):
        now = timezone.now()
        day_start, day_end = day_bounds_utc(now)
        month_start = month_start_utc(now)
        active = ConsultationSession.objects.exclude(status__in=[S.DRAFT, S.CANCELLED, S.REFUNDED])
        paid_month = ConsultationSession.objects.filter(
            status__in=[S.PAID, S.IN_PROGRESS, S.COMPLETED], scheduled_at__gte=month_start
        )
        revenue_kopecks = paid_month.aggregate(total=Sum("amount_kopecks"))["total"] or 0
        return Response({
            "clients": User.objects.filter(role=User.Role.CLIENT).count(),
            "psychologists": PsychologistProfile.objects.filter(verification_status=V.APPROVED).count(),
            "pending": PsychologistProfile.objects.filter(verification_status=V.PENDING).count(),
            "sessions_today": active.filter(scheduled_at__gte=day_start, scheduled_at__lt=day_end).count(),
            "sessions_month": active.filter(scheduled_at__gte=month_start).count(),
            "revenue_month_rub": revenue_kopecks // 100,
        })


class AdminSessionListView(APIView):
    permission_classes = [IsPlatformAdmin]

    def get(self, request):
        qs = (
            ConsultationSession.objects.select_related("client", "psychologist_profile__user", "payment")
            .exclude(status=S.DRAFT)
            .order_by("-created_at")[:100]
        )
        return Response(SessionSerializer(qs, many=True).data)
