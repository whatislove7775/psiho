"""Входные сериализаторы и функции представления для API персонала.

Ответы собираются явными функциями, чтобы по коду было видно: ни email,
ни реальные данные, ни содержимое переписки наружу не уходят.
"""
import re

from django.db.models import Count, Q
from rest_framework import serializers

from apps.sessions.models import ConsultationSession, SessionEvent
from apps.users.models import PsychologistProfile, User

from .models import AccountStatus, AuditLog, Report, StaffMember
from .roles import PERMISSION_LABELS, ROLE_CHOICES, ROLE_LABELS, get_staff_role


def _iso(dt):
    return serializers.DateTimeField().to_representation(dt) if dt else None


def _photo(profile):
    try:
        from apps.photos.utils import photo_url
    except Exception:  # pragma: no cover - приложение фото может отсутствовать
        return None
    try:
        return photo_url(profile)
    except Exception:  # pragma: no cover
        return None


# ── Пользователи ────────────────────────────────────────────────────

def account_status_of(user) -> AccountStatus | None:
    try:
        return user.account_status
    except AccountStatus.DoesNotExist:
        return None


def user_row(user, *, viewer_role: str | None) -> dict:
    status = account_status_of(user)
    profile = getattr(user, "psychologist_profile", None) if user.role == User.Role.PSYCHOLOGIST else None
    data = {
        "id": str(user.id),
        "alias": user.alias,
        "role": user.role,
        "staff_role": get_staff_role(user) if user.role == User.Role.ADMIN or user.is_staff else None,
        "is_active": user.is_active,
        "blocked": bool(status and status.blocked),
        "block_reason": status.block_reason if status and status.blocked else "",
        "blocked_at": _iso(status.blocked_at) if status and status.blocked else None,
        "avatar_config": user.avatar_config,
        "date_joined": _iso(user.date_joined),
        "last_login": _iso(user.last_login),
        "specialist": {
            "id": profile.id,
            "display_name": profile.display_name,
            "verification_status": profile.verification_status,
        } if profile else None,
    }
    if hasattr(user, "sessions_total"):
        data["sessions_total"] = user.sessions_total
    if hasattr(user, "reports_open"):
        data["reports_open"] = user.reports_open
    if viewer_role == "owner":
        # Только признак: сам email нигде не хранится, лишь его хеш
        data["has_email"] = user.has_email
    return data


def annotate_users(qs):
    return qs.select_related("account_status", "psychologist_profile").annotate(
        sessions_total=Count("client_sessions", distinct=True),
        reports_open=Count(
            "reports_received",
            filter=Q(reports_received__status__in=[Report.Status.OPEN, Report.Status.IN_REVIEW]),
            distinct=True,
        ),
    )


class ReasonSerializer(serializers.Serializer):
    reason = serializers.CharField(min_length=3, max_length=500, trim_whitespace=True)


class OptionalReasonSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")


# ── Специалисты ─────────────────────────────────────────────────────

def _hourly_rate(profile):
    try:
        from apps.availability.services import get_settings
    except Exception:  # pragma: no cover
        return None
    return get_settings(profile).hourly_rate_rub


def specialist_row(profile: PsychologistProfile, *, detail: bool = False) -> dict:
    user = profile.user
    status = account_status_of(user)
    photo = _photo(profile)
    data = {
        "id": profile.id,
        "user_id": str(user.id),
        "alias": user.alias,
        "display_name": profile.display_name,
        "avatar_config": user.avatar_config,
        "photo_url": photo,
        "verification_status": profile.verification_status,
        "rejection_reason": profile.rejection_reason,
        "specializations": profile.specializations or [],
        "languages": profile.languages or [],
        "experience_years": profile.experience_years,
        "session_rate_rub": int(profile.session_rate_rub),
        "hourly_rate_rub": _hourly_rate(profile),
        "created_at": _iso(profile.created_at),
        "verified_at": _iso(profile.verified_at),
        "verified_by": profile.verified_by.alias if profile.verified_by_id and profile.verified_by else None,
        "is_active": user.is_active,
        "blocked": bool(status and status.blocked),
        # Документы: только наличие. Содержимое зашифровано и в админку не отдаётся.
        "documents": {
            "full_name": bool(profile.encrypted_full_name),
            "diploma": bool(profile.encrypted_diploma_number),
            "phone": bool(profile.encrypted_phone),
            "photo": bool(photo),
        },
    }
    if detail:
        S = ConsultationSession.Status
        sessions = ConsultationSession.objects.filter(psychologist_profile=profile)
        data.update({
            "bio": profile.bio,
            "approach": profile.approach,
            "stats": {
                "completed": sessions.filter(status=S.COMPLETED).count(),
                "upcoming": sessions.filter(status__in=[S.PAID, S.AWAITING_PAYMENT]).count(),
                "cancelled": sessions.filter(status__in=[S.CANCELLED, S.REFUNDED]).count(),
            },
            "reports_open": Report.objects.filter(
                target_user=user, status__in=[Report.Status.OPEN, Report.Status.IN_REVIEW]
            ).count(),
            "schedule_rules": profile.schedule_slots.filter(is_active=True).count(),
        })
    else:
        data["bio"] = (profile.bio or "")[:280]
        data["approach"] = profile.approach
    return data


def _clean_tags(value):
    out = []
    for item in value:
        item = str(item).strip()[:60]
        if item and item not in out:
            out.append(item)
    if len(out) > 20:
        raise serializers.ValidationError("Не больше 20 элементов.")
    return out


class SpecialistEditSerializer(serializers.Serializer):
    display_name = serializers.CharField(max_length=80, required=False)
    bio = serializers.CharField(max_length=1200, required=False, allow_blank=True)
    approach = serializers.CharField(max_length=2000, required=False, allow_blank=True)
    specializations = serializers.ListField(child=serializers.CharField(), required=False)
    languages = serializers.ListField(child=serializers.CharField(), required=False)
    experience_years = serializers.IntegerField(min_value=0, max_value=80, required=False)
    # Цена часа (apps.availability); session_rate_rub пересчитывается из неё
    hourly_rate_rub = serializers.IntegerField(min_value=500, max_value=200_000, required=False)

    def validate_specializations(self, value):
        return _clean_tags(value)

    def validate_languages(self, value):
        return _clean_tags(value)


class SpecialistDecisionSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["approve", "reject", "suspend", "reinstate"])
    reason = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")

    def validate(self, attrs):
        if attrs["decision"] in ("reject", "suspend") and len(attrs["reason"].strip()) < 3:
            raise serializers.ValidationError({"reason": ["Укажите причину: специалист увидит её в кабинете."]})
        return attrs


# ── Сессии ──────────────────────────────────────────────────────────

EVENT_METADATA_KEYS = {"participant_role", "cancelled_by", "staff_role", "refund", "mode"}


def session_row(session: ConsultationSession, *, money: bool) -> dict:
    profile = session.psychologist_profile
    payment = getattr(session, "payment", None)
    data = {
        "id": str(session.id),
        "status": session.status,
        "scheduled_at": _iso(session.scheduled_at),
        "duration_minutes": session.duration_minutes,
        "amount_rub": session.amount_kopecks // 100,
        "created_at": _iso(session.created_at),
        "client": {
            "id": str(session.client_id),
            "alias": session.client.alias,
            "avatar_config": session.client.avatar_config,
        },
        "specialist": {
            "id": profile.id,
            "display_name": profile.display_name,
            "avatar_config": profile.user.avatar_config,
        },
        "payment": {
            "status": payment.status,
            "refunded_at": _iso(payment.refunded_at),
            "provider": "yookassa" if payment.yookassa_payment_id else "",
        } if payment else None,
    }
    if money:
        data["platform_fee_rub"] = session.platform_fee_kopecks // 100
        data["payout_rub"] = session.psychologist_payout_kopecks // 100
    return data


def session_detail(session: ConsultationSession, *, money: bool) -> dict:
    data = session_row(session, money=money)
    labels = dict(SessionEvent.EventType.choices)
    data["completed_at"] = _iso(session.completed_at)
    data["events"] = [
        {
            "type": e.event_type,
            "label": labels.get(e.event_type, e.event_type),
            "at": _iso(e.occurred_at),
            "meta": {k: v for k, v in (e.metadata or {}).items() if k in EVENT_METADATA_KEYS},
        }
        for e in session.events.all().order_by("occurred_at")[:100]
    ]
    data["reports"] = Report.objects.filter(target_session=session).count()
    return data


class SessionCancelSerializer(serializers.Serializer):
    reason = serializers.CharField(min_length=3, max_length=500)
    refund = serializers.BooleanField(default=False)


# ── Жалобы ──────────────────────────────────────────────────────────

class ReportCreateSerializer(serializers.Serializer):
    target_type = serializers.ChoiceField(choices=Report.TargetType.choices)
    target_id = serializers.CharField(max_length=64)
    reason = serializers.ChoiceField(choices=Report.Reason.choices)
    comment = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")


def report_public(report: Report) -> dict:
    return {
        "id": report.id,
        "target_type": report.target_type,
        "reason": report.reason,
        "reason_label": report.get_reason_display(),
        "status": report.status,
        "status_label": report.get_status_display(),
        "created_at": _iso(report.created_at),
    }


def report_row(report: Report) -> dict:
    target_user = report.target_user
    session = report.target_session
    specialist = None
    if target_user is not None and target_user.role == User.Role.PSYCHOLOGIST:
        profile = getattr(target_user, "psychologist_profile", None)
        if profile:
            specialist = {"id": profile.id, "display_name": profile.display_name,
                          "verification_status": profile.verification_status}
    return {
        **report_public(report),
        "comment": report.comment,
        "reporter": {
            "id": str(report.reporter_id) if report.reporter_id else None,
            "alias": report.reporter.alias if report.reporter else "удалённый аккаунт",
            "role": report.reporter.role if report.reporter else None,
        },
        "target": {
            "user": {
                "id": str(target_user.id), "alias": target_user.alias, "role": target_user.role,
                "is_active": target_user.is_active, "avatar_config": target_user.avatar_config,
            } if target_user else None,
            "specialist": specialist,
            "session": {
                "id": str(session.id), "status": session.status,
                "scheduled_at": _iso(session.scheduled_at),
            } if session else None,
            # Только идентификатор: текст сообщения персоналу не показывается
            "message_id": report.target_message_id or None,
        },
        "assignee": report.assignee.alias if report.assignee else None,
        "resolution_action": report.resolution_action or None,
        "resolution_note": report.resolution_note,
        "resolved_by": report.resolved_by.alias if report.resolved_by else None,
        "resolved_at": _iso(report.resolved_at),
        "target_reports_total": (
            Report.objects.filter(target_user=target_user).count() if target_user else 0
        ),
    }


class ReportResolveSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=[Report.Status.RESOLVED, Report.Status.DISMISSED])
    action = serializers.ChoiceField(choices=Report.Action.choices, default=Report.Action.NONE)
    note = serializers.CharField(min_length=3, max_length=1000)

    def validate(self, attrs):
        if attrs["status"] == Report.Status.DISMISSED and attrs["action"] != Report.Action.NONE:
            raise serializers.ValidationError({"action": ["Отклонённая жалоба не может сопровождаться мерами."]})
        return attrs


# ── Журнал ──────────────────────────────────────────────────────────

def audit_row(entry: AuditLog) -> dict:
    return {
        "id": entry.id,
        "at": _iso(entry.created_at),
        "actor": {"id": str(entry.actor_id) if entry.actor_id else None,
                  "alias": entry.actor_alias, "role": entry.actor_role},
        "action": entry.action,
        "target": {"type": entry.target_type, "id": entry.target_id, "label": entry.target_label},
        "details": entry.details,
        "ip": entry.ip,
        "user_agent": entry.user_agent,
    }


# ── Персонал ────────────────────────────────────────────────────────

LOGIN_RE = re.compile(r"^[a-z0-9а-я][a-z0-9а-я._-]{2,39}$")


class StaffCreateSerializer(serializers.Serializer):
    login = serializers.CharField(max_length=40)
    role = serializers.ChoiceField(choices=ROLE_CHOICES)
    note = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")

    def validate_login(self, value):
        from apps.users.aliases import normalize_alias

        value = normalize_alias(value)
        if not LOGIN_RE.match(value):
            raise serializers.ValidationError(
                "Логин: от 3 до 40 символов, строчные буквы, цифры, точка, дефис или подчёркивание."
            )
        if User.objects.filter(alias=value).exists():
            raise serializers.ValidationError("Этот логин уже занят.")
        return value


class StaffUpdateSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=ROLE_CHOICES, required=False)
    note = serializers.CharField(max_length=200, required=False, allow_blank=True)


def staff_row(user, member: StaffMember | None) -> dict:
    role = member.role if member else get_staff_role(user)
    return {
        "user_id": str(user.id),
        "alias": user.alias,
        "role": role,
        "role_label": ROLE_LABELS.get(role, role),
        "is_active": bool(user.is_active and (member.is_active if member else True)),
        "totp_enabled": bool(member and member.totp_enabled),
        "must_change_password": bool(member and member.must_change_password),
        "note": member.note if member else "",
        "created_at": _iso(member.created_at if member else user.date_joined),
        "created_by": member.created_by.alias if member and member.created_by else None,
        "last_login": _iso(user.last_login),
        "avatar_config": user.avatar_config,
    }


class PasswordChangeSerializer(serializers.Serializer):
    old_password = serializers.CharField(max_length=128)
    new_password = serializers.CharField(min_length=12, max_length=128)


class TotpCodeSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=12)


def permission_catalog() -> list[dict]:
    from .roles import PERMISSIONS

    return [
        {"perm": perm, "label": PERMISSION_LABELS.get(perm, perm), "roles": sorted(roles)}
        for perm, roles in PERMISSIONS.items()
    ]
