from django.core.management.base import BaseCommand, CommandError

from apps.staff.models import AuditLog, StaffMember
from apps.users.models import User


class Command(BaseCommand):
    help = "Сбрасывает 2FA сотрудника (если владелец потерял телефон): staff_reset_2fa <логин>"

    def add_arguments(self, parser):
        parser.add_argument("login")

    def handle(self, *args, **opts):
        user = User.objects.filter(alias=opts["login"].strip().lower()).first()
        if user is None:
            raise CommandError("Пользователь не найден.")
        updated = StaffMember.objects.filter(user=user).update(
            totp_enabled=False, totp_secret_encrypted="", totp_pending_encrypted="", totp_last_step=0
        )
        AuditLog.objects.create(action="staff.reset_2fa", actor_alias="manage.py", target_type="staff",
                                target_id=str(user.pk), target_label=user.alias, details={"via": "cli"})
        self.stdout.write(self.style.SUCCESS(f"2FA сброшена для «{user.alias}»" if updated else "Записи сотрудника нет — сбрасывать нечего."))
