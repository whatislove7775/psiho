from datetime import date, timedelta

from django.contrib.auth import authenticate
from django.contrib.auth.models import update_last_login
from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import generics, permissions, serializers, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .aliases import normalize_alias
from .models import PsychologistProfile, PsychologistSchedule, User
from .permissions import IsPsychologist
from .security import (
    check_recovery_key, email_hash_candidates, generate_recovery_key, hash_recovery_key,
)
from .serializers import (
    AnonymousSignupSerializer, ChangePasswordSerializer, DeleteAccountSerializer,
    LoginSerializer, PsychologistPrivateSerializer, PsychologistPublicSerializer,
    PsychologistRegisterSerializer, RecoverSerializer, ScheduleRuleSerializer, UserSerializer,
    schedule_overlap_error,
)
from .services import blacklist_user_tokens, delete_user_completely


def auth_payload(user, request, **extra) -> dict:
    refresh = RefreshToken.for_user(user)
    update_last_login(None, user)
    data = {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "user": UserSerializer(user, context={"request": request}).data,
    }
    data.update(extra)
    return data


class AuthThrottleMixin:
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"


# ── Авторизация ──────────────────────────────────────────────────

class AnonymousSignupView(AuthThrottleMixin, APIView):
    def post(self, request):
        serializer = AnonymousSignupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        recovery_key = generate_recovery_key()
        with transaction.atomic():
            user = User.objects.create_anonymous_client(serializer.validated_data["password"])
            user.recovery_key_hash = hash_recovery_key(recovery_key)
            user.save(update_fields=["recovery_key_hash"])
        return Response(
            auth_payload(user, request, recovery_key=recovery_key),
            status=status.HTTP_201_CREATED,
        )


class PsychologistRegisterView(AuthThrottleMixin, APIView):
    def post(self, request):
        serializer = PsychologistRegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        duplicate = Response(
            {"detail": "Пользователь с таким email уже существует."},
            status=status.HTTP_400_BAD_REQUEST,
        )
        if User.objects.filter(email_hash__in=email_hash_candidates(data["email"])).exists():
            return duplicate
        try:
            with transaction.atomic():
                user = User.objects.create_psychologist(email=data["email"], password=data["password"])
                PsychologistProfile.objects.create(
                    user=user,
                    display_name=data["display_name"],
                    bio=data.get("bio", ""),
                    specializations=data.get("specializations", []),
                    session_rate_rub=data["session_rate_rub"],
                    experience_years=data.get("experience_years", 0),
                )
        except IntegrityError:
            return duplicate
        user.refresh_from_db()
        return Response(auth_payload(user, request), status=status.HTTP_201_CREATED)


class LoginView(AuthThrottleMixin, APIView):
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate(
            request,
            login=serializer.validated_data["login"],
            password=serializer.validated_data["password"],
        )
        if user is None:
            return Response(
                {"detail": "Неверный логин или пароль."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Сотрудники с включённым TOTP передают ещё поле "otp" (apps.staff)
        from apps.staff.twofactor import login_second_factor
        challenge = login_second_factor(request, user)
        if challenge is not None:
            return challenge
        return Response(auth_payload(user, request))


class RecoverView(AuthThrottleMixin, APIView):
    def post(self, request):
        serializer = RecoverSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = User.objects.filter(alias=normalize_alias(data["alias"]), is_active=True).first()
        if user is None or not check_recovery_key(data["recovery_key"], user.recovery_key_hash):
            return Response(
                {"detail": "Неверный псевдоним или ключ восстановления."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        new_key = generate_recovery_key()
        user.set_password(data["new_password"])
        user.recovery_key_hash = hash_recovery_key(new_key)
        user.save(update_fields=["password", "recovery_key_hash"])
        blacklist_user_tokens(user)
        return Response(auth_payload(user, request, recovery_key=new_key))


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    http_method_names = ["get", "patch", "options"]

    def get_object(self):
        return self.request.user


class ChangePasswordView(APIView):
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        if not user.check_password(serializer.validated_data["old_password"]):
            return Response({"detail": "Текущий пароль указан неверно."}, status=400)
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        blacklist_user_tokens(user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class DeleteAccountView(APIView):
    def post(self, request):
        serializer = DeleteAccountSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        if not user.check_password(serializer.validated_data["password"]):
            return Response({"detail": "Неверный пароль."}, status=400)
        delete_user_completely(user)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Публичный каталог специалистов ───────────────────────────────

def approved_psychologists():
    from apps.credentials.services import annotate_credentials
    from apps.reviews.services import annotate_rating
    from apps.sessions.models import ConsultationSession

    return annotate_credentials(annotate_rating(
        PsychologistProfile.objects.filter(
            verification_status=PsychologistProfile.VerificationStatus.APPROVED,
            user__is_active=True,
        )
        .select_related("user", "photo")
        .annotate(
            completed_sessions_count=Count(
                "psychologist_sessions",
                filter=Q(psychologist_sessions__status=ConsultationSession.Status.COMPLETED),
            )
        )
        .order_by("-completed_sessions_count", "id")
    ))


class PsychologistListView(APIView):
    """Каталог: совместимый массив. Фильтры — см. apps.users.search.parse (q, topic, approach,
    max_rate, when, duration, min_experience, gender, language, sort, tz)."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        from . import search

        try:
            query = search.parse(request.query_params)
        except search.BadQuery as exc:
            return Response({"detail": str(exc)}, status=400)
        hits = search.search(approved_psychologists(), query)
        context = {"request": request, "next_starts": {h.profile.id: h.next_start for h in hits}}
        return Response(PsychologistPublicSerializer([h.profile for h in hits], many=True, context=context).data)


class PsychologistSearchView(APIView):
    """Палитра поиска: те же фильтры + `limit`, ответ `{count, results}`."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "search"

    def get(self, request):
        from . import search

        try:
            query = search.parse(request.query_params)
            limit = search._int(request.query_params, "limit", 1, 50) or 8
        except search.BadQuery as exc:
            return Response({"detail": str(exc)}, status=400)
        hits = search.search(approved_psychologists(), query)
        top = hits[:limit]
        context = {"request": request, "next_starts": {h.profile.id: h.next_start for h in top}}
        return Response({
            "count": len(hits),
            "results": PsychologistPublicSerializer([h.profile for h in top], many=True, context=context).data,
        })


class PsychologistFacetsView(APIView):
    """«Часто ищут» и значения фильтров для палитры поиска."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        from django.core.cache import cache

        from . import search

        data = cache.get("psychologists:facets")
        if data is None:
            data = search.facets(approved_psychologists())
            cache.set("psychologists:facets", data, 300)
        return Response(data)


class PsychologistDetailView(generics.RetrieveAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = PsychologistPublicSerializer

    def get_queryset(self):
        return approved_psychologists()


class PsychologistSlotsView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        from apps.sessions.scheduling import compute_slots, local_today

        profile = approved_psychologists().filter(pk=pk).first()
        if profile is None:
            return Response({"detail": "Специалист не найден."}, status=404)
        try:
            raw_from = request.query_params.get("from")
            from_date = date.fromisoformat(raw_from) if raw_from else local_today()
            days = int(request.query_params.get("days", 14))
        except ValueError:
            return Response({"detail": "Неверные параметры: from=YYYY-MM-DD, days — число."}, status=400)
        days = max(1, min(days, 60))
        from_date = max(from_date, local_today())
        slots = compute_slots(profile, from_date=from_date, days=days)
        return Response([
            {"start": _iso(start), "end": _iso(end)} for start, end in slots
        ])


def _iso(dt) -> str:
    return serializers.DateTimeField().to_representation(dt)


# ── Кабинет психолога ────────────────────────────────────────────

class PsychologistProfileView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsPsychologist]
    serializer_class = PsychologistPrivateSerializer
    http_method_names = ["get", "patch", "options"]

    def get_object(self):
        return self.request.user.psychologist_profile

    def perform_update(self, serializer):
        from apps.availability.services import set_rate_from_legacy

        old_rate = serializer.instance.session_rate_rub
        profile = serializer.save()
        if "session_rate_rub" in serializer.validated_data and profile.session_rate_rub != old_rate:
            set_rate_from_legacy(profile)


class PsychologistScheduleView(APIView):
    """Устаревший API недельных правил; новое — /psychologist/availability/ (apps.availability)."""

    permission_classes = [IsPsychologist]

    def _rules(self, profile):
        from apps.availability.services import legacy_rules

        return legacy_rules(profile)

    def get(self, request):
        return Response(self._rules(request.user.psychologist_profile))

    def put(self, request):
        if not isinstance(request.data, list):
            return Response({"detail": "Ожидается массив правил расписания."}, status=400)
        serializer = ScheduleRuleSerializer(data=request.data, many=True)
        serializer.is_valid(raise_exception=True)
        rules = serializer.validated_data
        error = schedule_overlap_error(rules)
        if error:
            return Response({"detail": error}, status=400)
        from apps.availability.services import replace_default_template

        profile = request.user.psychologist_profile
        replace_default_template(profile, rules)
        return Response(self._rules(profile))


class PsychologistStatsView(APIView):
    permission_classes = [IsPsychologist]

    def get(self, request):
        from apps.sessions.models import ConsultationSession
        from apps.sessions.stats import month_start_utc

        profile = request.user.psychologist_profile
        now = timezone.now()
        sessions = ConsultationSession.objects.filter(psychologist_profile=profile)
        S = ConsultationSession.Status
        completed = sessions.filter(status=S.COMPLETED)
        completed_month = completed.filter(scheduled_at__gte=month_start_utc(now))

        def earnings(qs):
            total = sum(qs.values_list("psychologist_payout_kopecks", flat=True))
            return total // 100

        upcoming = sum(
            1 for scheduled_at, duration in sessions.filter(
                status__in=[S.PAID, S.IN_PROGRESS, S.AWAITING_PAYMENT],
                scheduled_at__gte=now - timedelta(hours=3),
            ).values_list("scheduled_at", "duration_minutes")
            if scheduled_at + timedelta(minutes=duration) > now
        )
        return Response({
            "upcoming": upcoming,
            "sessions_month": completed_month.count(),
            "sessions_total": completed.count(),
            "earnings_month_rub": earnings(completed_month),
            "earnings_total_rub": earnings(completed),
            "clients_total": sessions.filter(
                status__in=[S.PAID, S.IN_PROGRESS, S.COMPLETED]
            ).values("client").distinct().count(),
        })
