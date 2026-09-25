"""API консоли персонала: /api/v1/staff/…  и жалобы пользователей: /api/v1/reports/…

Правило: каждый изменяющий запрос пишет запись в AuditLog (audit()).
"""
import secrets
import uuid
from datetime import timedelta

from django.core.paginator import EmptyPage, Paginator
from django.db import transaction
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.sessions.models import ConsultationSession
from apps.users.models import PsychologistProfile, User
from apps.users.services import blacklist_user_tokens

from . import system, totp
from .audit import audit
from .models import AccountStatus, AuditLog, Report, StaffMember
from .permissions import StaffPerm, StaffPermByMethod, staff_member_of, totp_required_for
from .roles import (
    OWNER, RANK, ROLE_LABELS, ROLES, can_manage_role, forget_staff_role, get_staff_role,
    has_staff_perm, staff_permissions,
)
from .serializers import (
    OptionalReasonSerializer, PasswordChangeSerializer, ReasonSerializer, ReportCreateSerializer,
    ReportResolveSerializer, SessionCancelSerializer, SpecialistDecisionSerializer,
    SpecialistEditSerializer, StaffCreateSerializer, StaffUpdateSerializer, TotpCodeSerializer,
    annotate_users, audit_row, permission_catalog, report_public, report_row, session_detail,
    session_row, specialist_row, staff_row, user_row,
)
from .services import ActionError, block_user, cancel_session, force_logout, unblock_user
from .throttles import STAFF_THROTTLES, ReportThrottle, TotpThrottle

S = ConsultationSession.Status
V = PsychologistProfile.VerificationStatus
PAGE_SIZE = 25


def paginate(request, qs, row, page_size=PAGE_SIZE):
    try:
        page_no = max(1, int(request.query_params.get("page", 1)))
    except ValueError:
        page_no = 1
    paginator = Paginator(qs, page_size)
    try:
        page = paginator.page(page_no)
    except EmptyPage:
        page = paginator.page(paginator.num_pages) if paginator.num_pages else []
    items = list(page) if page else []
    return {
        "count": paginator.count,
        "page": page.number if page else 1,
        "pages": paginator.num_pages,
        "results": [row(x) for x in items],
    }


def _bad(detail, code=status.HTTP_400_BAD_REQUEST):
    return Response({"detail": detail}, status=code)


def _parse_uuid(value):
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return None


class StaffView(APIView):
    """База: только сотрудники, с троттлингом. Право — атрибут staff_perm или staff_perms по методу."""
    staff_perm: str | None = None
    staff_perms: dict | None = None
    throttle_classes = STAFF_THROTTLES

    def get_permissions(self):
        if self.staff_perms:
            return [StaffPermByMethod()]
        return [StaffPerm(self.staff_perm)()]

    @property
    def role(self):
        return get_staff_role(self.request.user)


# ── Мой аккаунт сотрудника ──────────────────────────────────────────

class StaffMeView(APIView):
    throttle_classes = STAFF_THROTTLES

    def get_permissions(self):
        return [StaffPerm(None, setup=True)()]

    def get(self, request):
        user = request.user
        role = get_staff_role(user)
        member = staff_member_of(user)
        return Response({
            "user_id": str(user.id),
            "alias": user.alias,
            "role": role,
            "role_label": ROLE_LABELS.get(role, role),
            "permissions": staff_permissions(user),
            "totp_enabled": bool(member and member.totp_enabled),
            "totp_required": totp_required_for(user, role),
            "must_change_password": bool(member and member.must_change_password),
            "badges": _nav_badges(user),
        })


def _nav_badges(user) -> dict:
    """Счётчики для навигации — только по разделам, доступным роли."""
    badges = {}
    if has_staff_perm(user, "reports.view"):
        badges["reports"] = Report.objects.filter(status=Report.Status.OPEN).count()
    if has_staff_perm(user, "specialists.view"):
        badges["specialists"] = PsychologistProfile.objects.filter(verification_status=V.PENDING).count()
    if has_staff_perm(user, "support.inbox"):
        queue = _support_queue()
        if queue:
            badges["support"] = queue["unread"]
    return badges


class StaffPasswordView(APIView):
    throttle_classes = [TotpThrottle]

    def get_permissions(self):
        return [StaffPerm(None, setup=True)()]

    def post(self, request):
        ser = PasswordChangeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        user = request.user
        if not user.check_password(ser.validated_data["old_password"]):
            return _bad("Текущий пароль указан неверно.")
        if ser.validated_data["old_password"] == ser.validated_data["new_password"]:
            return _bad("Новый пароль должен отличаться от текущего.")
        user.set_password(ser.validated_data["new_password"])
        user.save(update_fields=["password"])
        StaffMember.objects.filter(user=user).update(must_change_password=False)
        blacklist_user_tokens(user)
        audit(request, "staff.me.password_changed", target=user)
        from apps.users.views import auth_payload
        return Response(auth_payload(user, request))


class TotpSetupView(APIView):
    throttle_classes = [TotpThrottle]

    def get_permissions(self):
        return [StaffPerm(None, setup=True)()]

    def post(self, request):
        user = request.user
        member = _ensure_member(user)
        if member.totp_enabled:
            return _bad("Двухфакторная защита уже включена.")
        secret = totp.generate_secret()
        member.totp_pending_encrypted = totp.encrypt_secret(secret)
        member.save(update_fields=["totp_pending_encrypted", "updated_at"])
        return Response({"secret": secret, "otpauth_url": totp.provisioning_uri(secret, user.alias)})


class TotpEnableView(APIView):
    throttle_classes = [TotpThrottle]

    def get_permissions(self):
        return [StaffPerm(None, setup=True)()]

    def post(self, request):
        ser = TotpCodeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        member = _ensure_member(request.user)
        secret = totp.decrypt_secret(member.totp_pending_encrypted)
        if not secret:
            return _bad("Сначала получите новый ключ.")
        step = totp.verify(secret, ser.validated_data["code"])
        if step is None:
            return _bad("Код не подошёл. Проверьте, что время на телефоне точное, и введите новый код.")
        member.totp_secret_encrypted = member.totp_pending_encrypted
        member.totp_pending_encrypted = ""
        member.totp_enabled = True
        member.totp_last_step = step
        member.save()
        audit(request, "staff.me.totp_enabled", target=request.user)
        return Response({"totp_enabled": True})


class TotpDisableView(APIView):
    throttle_classes = [TotpThrottle]

    def get_permissions(self):
        return [StaffPerm(None, setup=True)()]

    def post(self, request):
        from .twofactor import verify_member_code

        ser = TotpCodeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        member = staff_member_of(request.user)
        if not member or not member.totp_enabled:
            return _bad("Двухфакторная защита не включена.")
        if totp_required_for(request.user):
            return _bad("Для вашей роли двухфакторная защита обязательна.")
        if not verify_member_code(member, ser.validated_data["code"]):
            return _bad("Код не подошёл.")
        member.totp_enabled = False
        member.totp_secret_encrypted = ""
        member.save(update_fields=["totp_enabled", "totp_secret_encrypted", "updated_at"])
        audit(request, "staff.me.totp_disabled", target=request.user)
        return Response({"totp_enabled": False})


def _ensure_member(user) -> StaffMember:
    """Для наследных сотрудников (superuser / role=admin без записи) создаёт запись с их ролью."""
    member = staff_member_of(user)
    if member is None:
        member = StaffMember.objects.create(user=user, role=get_staff_role(user) or "admin")
    return member


# ── Сводка ──────────────────────────────────────────────────────────

class DashboardView(StaffView):
    staff_perm = "dashboard.view"

    def get(self, request):
        now = timezone.now()
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_ago = now - timedelta(days=7)
        month_start = today.replace(day=1)
        active = ConsultationSession.objects.exclude(status__in=[S.DRAFT, S.CANCELLED, S.REFUNDED])
        paid_statuses = [S.PAID, S.IN_PROGRESS, S.COMPLETED]

        data = {
            "users": {
                "clients": User.objects.filter(role=User.Role.CLIENT).count(),
                "new_week": User.objects.filter(role=User.Role.CLIENT, date_joined__gte=week_ago).count(),
                "blocked": AccountStatus.objects.filter(blocked=True).count(),
            },
            "specialists": {
                "active": PsychologistProfile.objects.filter(
                    verification_status=V.APPROVED, user__is_active=True).count(),
                "pending": PsychologistProfile.objects.filter(verification_status=V.PENDING).count(),
                "suspended": PsychologistProfile.objects.filter(verification_status=V.SUSPENDED).count(),
            },
            "sessions": {
                "today": active.filter(scheduled_at__gte=today, scheduled_at__lt=today + timedelta(days=1)).count(),
                "week": active.filter(scheduled_at__gte=week_ago, scheduled_at__lt=now).count(),
                "upcoming": active.filter(status=S.PAID, scheduled_at__gte=now).count(),
                "cancelled_week": ConsultationSession.objects.filter(
                    status__in=[S.CANCELLED, S.REFUNDED], updated_at__gte=week_ago).count(),
            },
            "reports": {
                "open": Report.objects.filter(status=Report.Status.OPEN).count(),
                "in_review": Report.objects.filter(status=Report.Status.IN_REVIEW).count(),
            },
            "support": _support_queue(),
            "revenue": None,
            "series": _sessions_series(now),
            "system": None,
            "recent_audit": None,
        }
        if has_staff_perm(request.user, "dashboard.revenue"):
            paid = ConsultationSession.objects.filter(status__in=paid_statuses)
            month = paid.filter(scheduled_at__gte=month_start).aggregate(
                total=Sum("amount_kopecks"), fee=Sum("platform_fee_kopecks"))
            week = paid.filter(scheduled_at__gte=week_ago).aggregate(total=Sum("amount_kopecks"))
            data["revenue"] = {
                "month_rub": (month["total"] or 0) // 100,
                "month_fee_rub": (month["fee"] or 0) // 100,
                "week_rub": (week["total"] or 0) // 100,
            }
        if has_staff_perm(request.user, "system.view"):
            data["system"] = {**system.health_summary(), "errors_24h": system.errors_last_24h()["total"]}
        if has_staff_perm(request.user, "audit.view"):
            data["recent_audit"] = [audit_row(e) for e in AuditLog.objects.all()[:6]]
        return Response(data)


def _sessions_series(now, days=14):
    start = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    rows = (
        ConsultationSession.objects.exclude(status__in=[S.DRAFT])
        .filter(scheduled_at__gte=start, scheduled_at__lt=start + timedelta(days=days))
        .annotate(d=TruncDate("scheduled_at"))
        .values("d").annotate(n=Count("id"))
    )
    by_day = {str(r["d"]): r["n"] for r in rows}
    out = []
    for i in range(days):
        d = (start + timedelta(days=i)).date().isoformat()
        out.append({"date": d, "sessions": by_day.get(d, 0)})
    return out


def _support_queue():
    """Открытые обращения в поддержку (чат A4), если приложение установлено. Только счётчик."""
    from django.apps import apps as django_apps

    if not django_apps.is_installed("apps.chat"):
        return None
    try:
        from django.db.models import F

        Conversation = django_apps.get_model("chat", "Conversation")
        qs = Conversation.objects.filter(kind__in=["client_support", "specialist_support"],
                                         last_message_at__isnull=False)
        return {"unread": qs.filter(Q(support_read_at__isnull=True) | Q(last_message_at__gt=F("support_read_at"))).count()}
    except Exception:
        return None


# ── Пользователи ────────────────────────────────────────────────────

class UserListView(StaffView):
    staff_perm = "users.view"

    def get(self, request):
        qs = User.objects.all()
        q = (request.query_params.get("q") or "").strip()
        if q:
            as_uuid = _parse_uuid(q)
            qs = qs.filter(id=as_uuid) if as_uuid else qs.filter(alias__icontains=q.lower().replace("ё", "е"))
        role = request.query_params.get("role")
        if role in ("client", "psychologist", "admin"):
            qs = qs.filter(role=role)
        state = request.query_params.get("status")
        if state == "blocked":
            qs = qs.filter(account_status__blocked=True)
        elif state == "active":
            qs = qs.filter(is_active=True)
        qs = annotate_users(qs).order_by("-date_joined")
        viewer = self.role
        return Response(paginate(request, qs, lambda u: user_row(u, viewer_role=viewer)))


def _get_user(pk):
    as_uuid = _parse_uuid(pk)
    return annotate_users(User.objects.filter(id=as_uuid)).first() if as_uuid else None


def _guard_target(request, target) -> Response | None:
    """Нельзя действовать над собой и над сотрудниками своего ранга и выше."""
    if target.pk == request.user.pk:
        return _bad("Это ваш собственный аккаунт.")
    target_role = _member_role(target)
    if target_role and not can_manage_role(get_staff_role(request.user), target_role):
        return _bad("Сотрудниками управляет владелец или администратор в разделе «Персонал».", status.HTTP_403_FORBIDDEN)
    return None


def _member_role(user):
    member = StaffMember.objects.filter(user=user).first()
    if member:
        return member.role
    if user.is_superuser:
        return OWNER
    if user.role == User.Role.ADMIN or user.is_staff:
        return "admin"
    return None


class UserDetailView(StaffView):
    staff_perm = "users.view"

    def get(self, request, pk):
        user = _get_user(pk)
        if user is None:
            return _bad("Пользователь не найден.", status.HTTP_404_NOT_FOUND)
        data = user_row(user, viewer_role=self.role)
        sessions = ConsultationSession.objects.select_related(
            "client", "psychologist_profile__user", "payment"
        ).exclude(status=S.DRAFT)
        profile = getattr(user, "psychologist_profile", None) if user.role == User.Role.PSYCHOLOGIST else None
        sessions = sessions.filter(Q(client=user) | Q(psychologist_profile=profile) if profile else Q(client=user))
        can_sessions = has_staff_perm(request.user, "sessions.view")
        data["sessions"] = [session_row(s, money=False) for s in sessions.order_by("-scheduled_at")[:10]] if can_sessions else None
        data["reports_received"] = Report.objects.filter(target_user=user).count()
        data["reports_sent"] = Report.objects.filter(reporter=user).count()
        data["history"] = [
            audit_row(e) for e in AuditLog.objects.filter(target_type="user", target_id=str(user.id))[:10]
        ] if has_staff_perm(request.user, "audit.view") or has_staff_perm(request.user, "users.block") else None
        return Response(data)


class UserBlockView(StaffView):
    staff_perm = "users.block"

    def post(self, request, pk):
        user = _get_user(pk)
        if user is None:
            return _bad("Пользователь не найден.", status.HTTP_404_NOT_FOUND)
        guard = _guard_target(request, user)
        if guard:
            return guard
        ser = ReasonSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        block_user(user, by=request.user, reason=ser.validated_data["reason"])
        audit(request, "user.block", target=user, details={"reason": ser.validated_data["reason"]})
        return Response(user_row(_get_user(pk), viewer_role=self.role))


class UserUnblockView(StaffView):
    staff_perm = "users.block"

    def post(self, request, pk):
        user = _get_user(pk)
        if user is None:
            return _bad("Пользователь не найден.", status.HTTP_404_NOT_FOUND)
        guard = _guard_target(request, user)
        if guard:
            return guard
        ser = OptionalReasonSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        unblock_user(user)
        audit(request, "user.unblock", target=user, details={"reason": ser.validated_data["reason"]})
        return Response(user_row(_get_user(pk), viewer_role=self.role))


class UserLogoutView(StaffView):
    staff_perm = "users.logout"

    def post(self, request, pk):
        user = _get_user(pk)
        if user is None:
            return _bad("Пользователь не найден.", status.HTTP_404_NOT_FOUND)
        guard = _guard_target(request, user)
        if guard:
            return guard
        force_logout(user)
        audit(request, "user.force_logout", target=user)
        return Response({"detail": "Все сеансы пользователя завершены."})


# ── Специалисты ─────────────────────────────────────────────────────

def _specialists_qs():
    return PsychologistProfile.objects.select_related("user", "user__account_status", "verified_by")


class SpecialistListView(StaffView):
    staff_perm = "specialists.view"

    def get(self, request):
        qs = _specialists_qs()
        wanted = request.query_params.get("status")
        if wanted:
            if wanted not in V.values:
                return _bad("Неизвестный статус.")
            qs = qs.filter(verification_status=wanted)
        q = (request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(Q(display_name__icontains=q) | Q(user__alias__icontains=q.lower()))
        order = "created_at" if wanted == V.PENDING else "-created_at"
        counts = dict(PsychologistProfile.objects.values_list("verification_status").annotate(n=Count("id")))
        data = paginate(request, qs.order_by(order), specialist_row)
        data["counts"] = {s: counts.get(s, 0) for s in V.values}
        return Response(data)


class SpecialistDetailView(StaffView):
    staff_perms = {"GET": "specialists.view", "PATCH": "specialists.edit"}

    def get(self, request, pk):
        profile = _specialists_qs().filter(pk=pk).first()
        if profile is None:
            return _bad("Специалист не найден.", status.HTTP_404_NOT_FOUND)
        return Response(specialist_row(profile, detail=True))

    def patch(self, request, pk):
        profile = _specialists_qs().filter(pk=pk).first()
        if profile is None:
            return _bad("Специалист не найден.", status.HTTP_404_NOT_FOUND)
        ser = SpecialistEditSerializer(data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        changes = {}
        data = dict(ser.validated_data)
        hourly = data.pop("hourly_rate_rub", None)
        for field, value in data.items():
            old = getattr(profile, field)
            if old != value:
                changes[field] = {"from": old, "to": value} if field in (
                    "experience_years", "display_name") else "изменено"
                setattr(profile, field, value)
        if changes:
            profile.save()
        if hourly is not None:
            from apps.availability.services import get_settings, sync_profile_rate

            settings_ = get_settings(profile)
            if settings_.hourly_rate_rub != hourly:
                changes["hourly_rate_rub"] = {"from": settings_.hourly_rate_rub, "to": hourly}
                settings_.hourly_rate_rub = hourly
                settings_.save(update_fields=["hourly_rate_rub", "updated_at"])
                sync_profile_rate(settings_)
        if changes:
            audit(request, "specialist.edit", target=profile, details={"fields": changes})
        return Response(specialist_row(_specialists_qs().get(pk=pk), detail=True))


DECISION_RULES = {
    # решение: (право, допустимые исходные статусы, итоговый статус)
    "approve": ("specialists.verify", {V.PENDING, V.REJECTED}, V.APPROVED),
    "reject": ("specialists.verify", {V.PENDING}, V.REJECTED),
    "suspend": ("specialists.suspend", {V.APPROVED}, V.SUSPENDED),
    "reinstate": ("specialists.verify", {V.SUSPENDED}, V.APPROVED),
}


def apply_specialist_decision(request, profile, decision: str, reason: str) -> Response | None:
    perm, sources, result = DECISION_RULES[decision]
    if not has_staff_perm(request.user, perm):
        return _bad("У вашей роли нет права на это решение.", status.HTTP_403_FORBIDDEN)
    if profile.verification_status not in sources:
        return _bad("Для текущего статуса специалиста это действие недоступно.")
    before = profile.verification_status
    profile.verification_status = result
    profile.rejection_reason = reason if decision in ("reject", "suspend") else ""
    if decision in ("approve", "reinstate", "reject"):
        profile.verified_by = request.user
        profile.verified_at = timezone.now()
    profile.save()
    audit(request, f"specialist.{decision}", target=profile,
          details={"from": before, "to": result, **({"reason": reason} if reason else {})})
    return None


class SpecialistDecisionView(StaffView):
    staff_perm = "specialists.view"

    def post(self, request, pk):
        profile = _specialists_qs().filter(pk=pk).first()
        if profile is None:
            return _bad("Специалист не найден.", status.HTTP_404_NOT_FOUND)
        ser = SpecialistDecisionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        error = apply_specialist_decision(
            request, profile, ser.validated_data["decision"], ser.validated_data["reason"].strip())
        if error:
            return error
        return Response(specialist_row(profile, detail=True))


# ── Сессии ──────────────────────────────────────────────────────────

def _sessions_qs():
    return ConsultationSession.objects.select_related(
        "client", "psychologist_profile__user", "payment"
    ).exclude(status=S.DRAFT)


class SessionListView(StaffView):
    staff_perm = "sessions.view"

    def get(self, request):
        from datetime import date

        qs = _sessions_qs()
        st = request.query_params.get("status")
        if st:
            wanted = [x for x in st.split(",") if x in S.values]
            qs = qs.filter(status__in=wanted)
        try:
            if request.query_params.get("from"):
                qs = qs.filter(scheduled_at__date__gte=date.fromisoformat(request.query_params["from"]))
            if request.query_params.get("to"):
                qs = qs.filter(scheduled_at__date__lte=date.fromisoformat(request.query_params["to"]))
        except ValueError:
            return _bad("Даты в формате ГГГГ-ММ-ДД.")
        q = (request.query_params.get("q") or "").strip()
        if q:
            as_uuid = _parse_uuid(q)
            if as_uuid:
                qs = qs.filter(Q(id=as_uuid) | Q(client_id=as_uuid))
            else:
                qs = qs.filter(
                    Q(client__alias__icontains=q.lower()) | Q(psychologist_profile__display_name__icontains=q)
                )
        if request.query_params.get("specialist"):
            qs = qs.filter(psychologist_profile_id=request.query_params["specialist"])
        money = has_staff_perm(request.user, "dashboard.revenue")
        return Response(paginate(request, qs.order_by("-scheduled_at"), lambda s: session_row(s, money=money)))


def _get_session(pk):
    return _sessions_qs().filter(pk=pk).first()


class SessionDetailView(StaffView):
    staff_perm = "sessions.view"

    def get(self, request, pk):
        session = _get_session(pk)
        if session is None:
            return _bad("Сессия не найдена.", status.HTTP_404_NOT_FOUND)
        return Response(session_detail(session, money=has_staff_perm(request.user, "dashboard.revenue")))


class SessionCancelView(StaffView):
    staff_perm = "sessions.cancel"

    def post(self, request, pk):
        session = _get_session(pk)
        if session is None:
            return _bad("Сессия не найдена.", status.HTTP_404_NOT_FOUND)
        ser = SessionCancelSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        refund = ser.validated_data["refund"]
        if refund and not has_staff_perm(request.user, "sessions.refund"):
            return _bad("Возврат может оформить только администратор.", status.HTTP_403_FORBIDDEN)
        before = session.status
        try:
            result = cancel_session(session, refund=refund, reason=ser.validated_data["reason"], by_role=self.role)
        except ActionError as exc:
            return _bad(str(exc))
        audit(request, "session.refund" if refund else "session.cancel", target=session, details={
            "reason": ser.validated_data["reason"], "from": before, "to": result.get("status"),
            **({"refund_mode": result.get("mode")} if refund else {}),
        })
        session = _get_session(pk)
        return Response(session_detail(session, money=has_staff_perm(request.user, "dashboard.revenue")))


# ── Жалобы (пользователи) ───────────────────────────────────────────

class ReportCreateView(APIView):
    """POST /api/v1/reports/ — «Пожаловаться». Доступно любому вошедшему пользователю."""
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ReportThrottle]

    def post(self, request):
        ser = ReportCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        resolved = _resolve_report_target(request.user, data["target_type"], data["target_id"].strip())
        if isinstance(resolved, Response):
            return resolved
        target_user, session, message_id = resolved
        if target_user is not None and target_user.pk == request.user.pk:
            return _bad("Нельзя пожаловаться на себя.")
        duplicate = Report.objects.filter(
            reporter=request.user, target_type=data["target_type"], target_user=target_user,
            target_session=session, target_message_id=message_id,
            status__in=[Report.Status.OPEN, Report.Status.IN_REVIEW],
        ).first()
        if duplicate:
            return Response(report_public(duplicate), status=status.HTTP_200_OK)
        report = Report.objects.create(
            reporter=request.user, target_type=data["target_type"], target_user=target_user,
            target_session=session, target_message_id=message_id, reason=data["reason"],
            comment=data["comment"].strip(),
        )
        return Response(report_public(report), status=status.HTTP_201_CREATED)


class MyReportsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = Report.objects.filter(reporter=request.user)[:50]
        return Response([report_public(r) for r in qs])


def _resolve_report_target(reporter, target_type, target_id):
    """(target_user, session, message_id) или Response с ошибкой. Проверяет, что жалобщик
    действительно мог видеть объект (участник сессии / разговора)."""
    T = Report.TargetType
    not_found = _bad("Не нашли, на что вы жалуетесь. Обновите страницу и попробуйте снова.",
                     status.HTTP_404_NOT_FOUND)
    if target_type == T.USER:
        as_uuid = _parse_uuid(target_id)
        user = User.objects.filter(id=as_uuid).first() if as_uuid else \
            User.objects.filter(alias=target_id.lower().replace("ё", "е")).first()
        return (user, None, "") if user else not_found
    if target_type == T.SPECIALIST:
        profile = PsychologistProfile.objects.select_related("user").filter(
            pk=target_id if target_id.isdigit() else -1).first()
        return (profile.user, None, "") if profile else not_found
    if target_type == T.SESSION:
        as_uuid = _parse_uuid(target_id)
        session = ConsultationSession.objects.select_related("psychologist_profile__user").filter(
            id=as_uuid).first() if as_uuid else None
        if session is None:
            return not_found
        if session.client_id == reporter.pk:
            return session.psychologist_profile.user, session, ""
        if session.psychologist_profile.user_id == reporter.pk:
            return session.client, session, ""
        return not_found
    if target_type == T.MESSAGE:
        return _resolve_message(reporter, target_id, not_found)
    return not_found


def _resolve_message(reporter, message_id, not_found):
    from django.apps import apps as django_apps

    if not django_apps.is_installed("apps.chat"):
        return not_found
    try:
        Message = django_apps.get_model("chat", "Message")
        msg = Message.objects.select_related("conversation__specialist__user", "conversation__client", "sender") \
            .filter(pk=message_id).first()
    except Exception:
        return not_found
    if msg is None:
        return not_found
    conv = msg.conversation
    participants = {conv.client_id}
    if conv.specialist_id:
        participants.add(conv.specialist.user_id)
    is_member = reporter.pk in participants or conv.members.filter(user=reporter).exists()
    if not is_member:
        return not_found
    return msg.sender, None, str(msg.pk)


# ── Модерация (персонал) ────────────────────────────────────────────

def _reports_qs():
    return Report.objects.select_related(
        "reporter", "target_user", "target_user__psychologist_profile", "target_session",
        "assignee", "resolved_by",
    )


class ReportListView(StaffView):
    staff_perm = "reports.view"

    def get(self, request):
        qs = _reports_qs()
        st = request.query_params.get("status", "active")
        if st == "active":
            qs = qs.filter(status__in=[Report.Status.OPEN, Report.Status.IN_REVIEW])
        elif st in Report.Status.values:
            qs = qs.filter(status=st)
        if request.query_params.get("target_user"):
            as_uuid = _parse_uuid(request.query_params["target_user"])
            qs = qs.filter(target_user_id=as_uuid) if as_uuid else qs.none()
        counts = dict(Report.objects.values_list("status").annotate(n=Count("id")))
        data = paginate(request, qs.order_by("-created_at"), report_row)
        data["counts"] = {s: counts.get(s, 0) for s in Report.Status.values}
        return Response(data)


class ReportAssignView(StaffView):
    staff_perm = "reports.resolve"

    def post(self, request, pk):
        report = _reports_qs().filter(pk=pk).first()
        if report is None:
            return _bad("Жалоба не найдена.", status.HTTP_404_NOT_FOUND)
        if report.status not in (Report.Status.OPEN, Report.Status.IN_REVIEW):
            return _bad("Жалоба уже закрыта.")
        report.status = Report.Status.IN_REVIEW
        report.assignee = request.user
        report.save(update_fields=["status", "assignee"])
        audit(request, "report.assign", target=report)
        return Response(report_row(report))


class ReportResolveView(StaffView):
    staff_perm = "reports.resolve"

    def post(self, request, pk):
        report = _reports_qs().filter(pk=pk).first()
        if report is None:
            return _bad("Жалоба не найдена.", status.HTTP_404_NOT_FOUND)
        if report.status not in (Report.Status.OPEN, Report.Status.IN_REVIEW):
            return _bad("Жалоба уже закрыта.")
        ser = ReportResolveSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        action, note = ser.validated_data["action"], ser.validated_data["note"]
        A = Report.Action
        with transaction.atomic():
            error = self._apply(request, report, action, note)
            if error:
                transaction.set_rollback(True)
                return error
            report.status = ser.validated_data["status"]
            report.resolution_action = action
            report.resolution_note = note
            report.resolved_by = request.user
            report.resolved_at = timezone.now()
            if report.assignee_id is None:
                report.assignee = request.user
            report.save()
            audit(request, f"report.{report.status}", target=report,
                  details={"action": action, "note": note, "target_type": report.target_type,
                           "target_user": str(report.target_user_id) if report.target_user_id else None})
        report.refresh_from_db()
        return Response(report_row(report))

    def _apply(self, request, report, action, note):
        A = Report.Action
        target = report.target_user
        if action in (A.NONE, A.WARN):
            return None
        if action == A.BLOCK_USER:
            if not has_staff_perm(request.user, "users.block"):
                return _bad("У вашей роли нет права блокировать аккаунты.", status.HTTP_403_FORBIDDEN)
            if target is None:
                return _bad("У жалобы нет аккаунта, который можно заблокировать.")
            guard = _guard_target(request, target)
            if guard:
                return guard
            block_user(target, by=request.user, reason=f"Жалоба №{report.pk}: {note}")
            audit(request, "user.block", target=target, details={"reason": note, "report": report.pk})
            return None
        if action == A.SUSPEND_SPECIALIST:
            profile = getattr(target, "psychologist_profile", None) if target else None
            if profile is None:
                return _bad("Жалоба не относится к специалисту.")
            return apply_specialist_decision(request, profile, "suspend", f"Жалоба №{report.pk}: {note}")
        if action == A.CANCEL_SESSION:
            if not has_staff_perm(request.user, "sessions.cancel"):
                return _bad("У вашей роли нет права отменять созвоны.", status.HTTP_403_FORBIDDEN)
            if report.target_session is None:
                return _bad("Жалоба не относится к созвону.")
            try:
                cancel_session(report.target_session, refund=False, reason=note, by_role=get_staff_role(request.user))
            except ActionError as exc:
                return _bad(str(exc))
            audit(request, "session.cancel", target=report.target_session,
                  details={"reason": note, "report": report.pk})
            return None
        return _bad("Неизвестное действие.")


# ── Журнал ──────────────────────────────────────────────────────────

class AuditListView(StaffView):
    staff_perm = "audit.view"

    def get(self, request):
        qs = AuditLog.objects.all()
        p = request.query_params
        if p.get("category"):
            qs = qs.filter(action__startswith=p["category"] + ".")
        if p.get("action"):
            qs = qs.filter(action=p["action"])
        if p.get("actor"):
            qs = qs.filter(actor_alias__icontains=p["actor"].strip().lower())
        if p.get("target_type"):
            qs = qs.filter(target_type=p["target_type"])
        if p.get("target_id"):
            qs = qs.filter(target_id=p["target_id"])
        if p.get("q"):
            q = p["q"].strip()
            qs = qs.filter(Q(target_label__icontains=q) | Q(actor_alias__icontains=q.lower()) | Q(target_id=q))
        return Response(paginate(request, qs, audit_row, page_size=50))


# ── Система ─────────────────────────────────────────────────────────

class SystemView(StaffView):
    staff_perm = "system.view"

    def get(self, request):
        return Response({
            "health": system.health_summary(),
            "version": system.version_info(),
            "migrations": system.migrations_status(),
            "errors": system.errors_last_24h(),
            "integrations": system.integrations(),
            "security": {
                "staff_2fa_required": totp_required_for(request.user, OWNER),
                "staff_without_2fa": _staff_without_2fa(),
            },
            "counts": {
                "users": User.objects.count(),
                "sessions": ConsultationSession.objects.count(),
                "audit_entries": AuditLog.objects.count(),
            },
        })


def _staff_without_2fa() -> int:
    return sum(1 for user, member in _staff_pairs() if user.is_active and not (member and member.totp_enabled))


# ── Персонал ────────────────────────────────────────────────────────

def _staff_pairs():
    users = (
        User.objects.filter(Q(staff_member__isnull=False) | Q(is_superuser=True) | Q(role=User.Role.ADMIN) | Q(is_staff=True))
        .select_related("staff_member", "staff_member__created_by")
        .order_by("date_joined")
        .distinct()
    )
    out = []
    for user in users:
        try:
            member = user.staff_member
        except StaffMember.DoesNotExist:
            member = None
        out.append((user, member))
    return out


def _one_time_password() -> str:
    alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"
    raw = "".join(secrets.choice(alphabet) for _ in range(16))
    return "-".join(raw[i:i + 4] for i in range(0, 16, 4))


class StaffListView(StaffView):
    staff_perms = {"GET": "staff.view", "POST": "staff.manage"}

    def get(self, request):
        pairs = _staff_pairs()
        rows = [staff_row(u, m) for u, m in pairs]
        rows.sort(key=lambda r: (not r["is_active"], -RANK.get(r["role"] or "", 0), r["alias"]))
        return Response({
            "results": rows,
            "roles": [{"value": r, "label": ROLE_LABELS[r], "manageable": can_manage_role(self.role, r)} for r in ROLES],
            "matrix": permission_catalog(),
        })

    def post(self, request):
        ser = StaffCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        role = ser.validated_data["role"]
        if not can_manage_role(self.role, role):
            return _bad("Эту роль может выдать только владелец.", status.HTTP_403_FORBIDDEN)
        password = _one_time_password()
        with transaction.atomic():
            user = User.objects.create_user(alias=ser.validated_data["login"], password=password, role=User.Role.ADMIN)
            member = StaffMember.objects.create(
                user=user, role=role, must_change_password=True, created_by=request.user,
                note=ser.validated_data["note"],
            )
        audit(request, "staff.create", target=member, details={"role": role})
        return Response({"member": staff_row(user, member), "one_time_password": password},
                        status=status.HTTP_201_CREATED)


def _manageable_member(request, user_id):
    as_uuid = _parse_uuid(user_id)
    user = User.objects.filter(id=as_uuid).first() if as_uuid else None
    if user is None:
        return None, _bad("Сотрудник не найден.", status.HTTP_404_NOT_FOUND)
    if user.pk == request.user.pk:
        return None, _bad("Свою роль и доступ меняет другой администратор или владелец.", status.HTTP_403_FORBIDDEN)
    current = _member_role(user)
    if current is None:
        return None, _bad("Этот аккаунт не сотрудник.", status.HTTP_404_NOT_FOUND)
    if not can_manage_role(get_staff_role(request.user), current):
        return None, _bad("Этим сотрудником может управлять только владелец.", status.HTTP_403_FORBIDDEN)
    member = StaffMember.objects.filter(user=user).first()
    if member is None:
        member = StaffMember.objects.create(user=user, role=current)
    return member, None


class StaffDetailView(StaffView):
    staff_perm = "staff.manage"

    def patch(self, request, user_id):
        member, error = _manageable_member(request, user_id)
        if error:
            return error
        ser = StaffUpdateSerializer(data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        details = {}
        new_role = ser.validated_data.get("role")
        if new_role and new_role != member.role:
            if not can_manage_role(self.role, new_role):
                return _bad("Эту роль может выдать только владелец.", status.HTTP_403_FORBIDDEN)
            details["role"] = {"from": member.role, "to": new_role}
            member.role = new_role
        if "note" in ser.validated_data and ser.validated_data["note"] != member.note:
            member.note = ser.validated_data["note"]
            details["note"] = "изменено"
        if details:
            member.save()
            forget_staff_role(member.user)
            audit(request, "staff.update", target=member, details=details)
        return Response(staff_row(member.user, member))


class StaffActionView(StaffView):
    staff_perm = "staff.manage"
    action = ""

    def post(self, request, user_id):
        member, error = _manageable_member(request, user_id)
        if error:
            return error
        user = member.user
        extra = {}
        if self.action == "deactivate":
            member.is_active = False
            member.save(update_fields=["is_active", "updated_at"])
            user.is_active = False
            user.save(update_fields=["is_active"])
            force_logout(user)
        elif self.action == "activate":
            member.is_active = True
            member.save(update_fields=["is_active", "updated_at"])
            user.is_active = True
            user.save(update_fields=["is_active"])
        elif self.action == "reset_password":
            password = _one_time_password()
            user.set_password(password)
            user.save(update_fields=["password"])
            member.must_change_password = True
            member.save(update_fields=["must_change_password", "updated_at"])
            force_logout(user)
            extra["one_time_password"] = password
        elif self.action == "reset_2fa":
            member.totp_enabled = False
            member.totp_secret_encrypted = ""
            member.totp_pending_encrypted = ""
            member.save()
            force_logout(user)
        audit(request, f"staff.{self.action}", target=member)
        return Response({"member": staff_row(user, member), **extra})
