"""DRF-классы прав для персонала.

    permission_classes = [StaffPerm("reports.resolve")]

StaffPerm проверяет: пользователь — активный сотрудник, у роли есть право,
пароль не одноразовый, и (если включено STAFF_REQUIRE_2FA) у владельца/админа
настроен TOTP. Для служебных эндпоинтов «мой аккаунт» — StaffPerm(None, setup=True).
"""
import os

from django.conf import settings
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission

from .roles import TOTP_REQUIRED_ROLES, get_staff_role, role_has_perm


def totp_required_setting() -> bool:
    value = getattr(settings, "STAFF_REQUIRE_2FA", None)
    if value is None:
        value = os.environ.get("STAFF_REQUIRE_2FA", "").strip().lower() in ("1", "true", "yes", "on")
    return bool(value)


def staff_member_of(user):
    from .models import StaffMember

    return StaffMember.objects.filter(user_id=user.pk).first()


def totp_required_for(user, role: str | None = None) -> bool:
    role = role or get_staff_role(user)
    return totp_required_setting() and role in TOTP_REQUIRED_ROLES


def _deny(detail: str, code: str):
    raise PermissionDenied({"detail": detail, "code": code})


class _StaffPermission(BasePermission):
    perm: str | None = None
    setup: bool = False
    message = "Раздел доступен только сотрудникам."

    def has_permission(self, request, view):
        user = request.user
        role = get_staff_role(user)
        if role is None:
            return False
        if self.perm and not role_has_perm(role, self.perm):
            _deny("У вашей роли нет доступа к этому разделу.", "staff_forbidden")
        if not self.setup:
            member = staff_member_of(user)
            if member is not None and member.must_change_password:
                _deny("Сначала смените одноразовый пароль.", "password_change_required")
            if totp_required_for(user, role) and not (member and member.totp_enabled):
                _deny("Включите двухфакторную защиту, чтобы продолжить.", "totp_setup_required")
        return True


def StaffPerm(perm: str | None = None, *, setup: bool = False):
    """Фабрика класса прав: StaffPerm("users.block")."""
    name = f"StaffPerm_{(perm or 'any').replace('.', '_')}{'_setup' if setup else ''}"
    return type(name, (_StaffPermission,), {"perm": perm, "setup": setup})


IsStaffMember = StaffPerm(None)


class StaffPermByMethod(_StaffPermission):
    """Разные права на чтение и изменение: view.perms = {"GET": "...", "POST": "..."}."""

    def has_permission(self, request, view):
        perms = getattr(view, "staff_perms", {})
        self.perm = perms.get(request.method) or perms.get("*")
        return super().has_permission(request, view)
