"""Второй фактор при входе сотрудника (вызывается из apps.users.views.LoginView)."""
from rest_framework import status
from rest_framework.response import Response

from . import totp
from .audit import audit
from .models import StaffMember
from .roles import get_staff_role


def verify_member_code(member: StaffMember, code: str) -> bool:
    secret = totp.decrypt_secret(member.totp_secret_encrypted)
    step = totp.verify(secret, code, last_step=member.totp_last_step)
    if step is None:
        return False
    StaffMember.objects.filter(pk=member.pk).update(totp_last_step=step)
    member.totp_last_step = step
    return True


def login_second_factor(request, user):
    """None — можно выдавать токены; иначе готовый ответ с требованием кода."""
    role = get_staff_role(user)
    if role is None:
        return None
    member = StaffMember.objects.filter(user=user, totp_enabled=True).first()
    if member is None:
        audit(request, "auth.staff_login", target=user, actor=user, details={"second_factor": False})
        return None
    code = str(request.data.get("otp") or "").strip()
    if not code:
        return Response(
            {"detail": "Введите шестизначный код из приложения-аутентификатора.", "otp_required": True},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not verify_member_code(member, code):
        audit(request, "auth.staff_login_failed", target=user, actor=user, details={"reason": "bad_otp"})
        return Response(
            {"detail": "Код не подошёл. Проверьте время на телефоне и введите новый код.", "otp_required": True},
            status=status.HTTP_400_BAD_REQUEST,
        )
    audit(request, "auth.staff_login", target=user, actor=user, details={"second_factor": True})
    return None
