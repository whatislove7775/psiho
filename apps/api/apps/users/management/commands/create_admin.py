import os

from django.core.management.base import BaseCommand

from apps.users.models import User
from apps.users.security import email_hash_candidates


class Command(BaseCommand):
    help = (
        "Создаёт администратора из переменных окружения ADMIN_LOGIN / ADMIN_PASSWORD "
        "(опционально ADMIN_EMAIL), если они заданы и такого пользователя ещё нет."
    )

    def handle(self, *args, **options):
        login = (os.environ.get("ADMIN_LOGIN") or "").strip().lower()
        password = os.environ.get("ADMIN_PASSWORD") or ""
        email = (os.environ.get("ADMIN_EMAIL") or "").strip() or None

        if not login or not password:
            self.stdout.write("ADMIN_LOGIN/ADMIN_PASSWORD не заданы — администратор не создаётся.")
            return
        if len(password) < 12:
            self.stderr.write("ADMIN_PASSWORD слишком короткий (минимум 12 символов) — пропуск.")
            return
        if User.objects.filter(alias=login).exists():
            self.stdout.write(f"Пользователь «{login}» уже существует — пропуск.")
            return
        if email and User.objects.filter(email_hash__in=email_hash_candidates(email)).exists():
            self.stdout.write("Пользователь с ADMIN_EMAIL уже существует — пропуск.")
            return

        User.objects.create_superuser(alias=login, password=password, email=email)
        self.stdout.write(self.style.SUCCESS(f"Администратор «{login}» создан."))
