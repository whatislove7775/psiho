"""Демо-данные для локальной разработки: `python manage.py seed_demo`.

Создаёт анонимного клиента, одобренных психологов с расписанием, одного на
проверке, администратора и несколько сессий (одна доступна для входа сейчас).
Никогда не запускается автоматически в продакшене.
"""
from datetime import time, timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.sessions.models import ConsultationSession
from apps.users.models import PsychologistProfile, PsychologistSchedule, User

PASSWORD = "demo-password-123"

PSYCHOLOGISTS = [
    ("anna@demo.local", "Анна Соколова", ["Тревога", "Выгорание", "Самооценка"], 3500, 9,
     "Помогаю разобраться с тревогой и вернуть ощущение опоры. Работаю бережно и без оценок.",
     "Когнитивно-поведенческая терапия, элементы ACT."),
    ("mark@demo.local", "Марк Литвинов", ["Отношения", "Кризисы", "Горе и утрата"], 4200, 14,
     "Работаю с парами и с теми, кто переживает расставание или утрату.",
     "Эмоционально-фокусированная терапия, гештальт."),
    ("vera@demo.local", "Вера Ким", ["Депрессия", "Панические атаки", "Сон"], 2900, 5,
     "Поддерживаю в периоды, когда сложно встать с кровати и всё кажется бессмысленным.",
     "КПТ, поведенческая активация, работа со сном."),
    ("ilya@demo.local", "Илья Громов", ["Зависимости", "Гнев", "Мужская психология"], 3800, 11,
     "Говорю прямо и по делу. Помогаю понять, что стоит за срывами, и выстроить план.",
     "Мотивационное интервьюирование, схема-терапия."),
]

# Пол специалиста — необязательное поле профиля (фильтр в поиске)
GENDERS = {"Анна Соколова": "female", "Марк Литвинов": "male", "Вера Ким": "female", "Илья Громов": "male"}


class Command(BaseCommand):
    help = "Заполняет базу демо-данными для локальной разработки"

    def handle(self, *args, **opts):
        if not settings.DEBUG and not settings.DATABASES["default"]["ENGINE"].endswith("sqlite3"):
            raise CommandError("seed_demo разрешён только локально (DEBUG=True или SQLite)")

        client = User.objects.filter(alias="тихий-кит-0001").first()
        if not client:
            client = User.objects.create_anonymous_client(PASSWORD)
            client.alias = "тихий-кит-0001"
            client.save(update_fields=["alias"])

        profiles = []
        for email, name, specs, rate, years, bio, approach in PSYCHOLOGISTS:
            existing = PsychologistProfile.objects.filter(display_name=name).first()
            if existing:
                if not existing.gender and name in GENDERS:
                    existing.gender = GENDERS[name]
                    existing.save(update_fields=["gender"])
                profiles.append(existing)
                continue
            user = User.objects.create_psychologist(email, PASSWORD)
            profile = PsychologistProfile.objects.create(
                user=user,
                display_name=name,
                bio=bio,
                approach=approach,
                specializations=specs,
                languages=["Русский"],
                experience_years=years,
                gender=GENDERS.get(name, ""),
                session_rate_rub=rate,
                verification_status="approved",
                verified_at=timezone.now(),
            )
            for wd in range(7):
                PsychologistSchedule.objects.create(
                    psychologist=profile, weekday=wd, start_time=time(8, 0), end_time=time(23, 0)
                )
            profiles.append(profile)

        if not PsychologistProfile.objects.filter(display_name="Олег Новиков").exists():
            user = User.objects.create_psychologist("oleg@demo.local", PASSWORD)
            PsychologistProfile.objects.create(
                user=user, display_name="Олег Новиков", bio="Семейный психолог, работаю с подростками.",
                specializations=["Подростки", "Семья"], languages=["Русский"], experience_years=6,
                session_rate_rub=3000, verification_status="pending",
            )

        if not User.objects.filter(alias="admin").exists():
            admin = User.objects.create_superuser(alias="admin", password=PASSWORD)
            admin.role = "admin"
            admin.save(update_fields=["role"])

        if not ConsultationSession.objects.filter(client=client).exists():
            now = timezone.now()
            rate = int(profiles[0].session_rate_rub)
            ConsultationSession.objects.create(
                client=client, psychologist_profile=profiles[0], status="paid",
                scheduled_at=now - timedelta(minutes=5), duration_minutes=50, amount_kopecks=rate * 100,
            )
            ConsultationSession.objects.create(
                client=client, psychologist_profile=profiles[1], status="paid",
                scheduled_at=now + timedelta(days=2, hours=3), duration_minutes=50,
                amount_kopecks=int(profiles[1].session_rate_rub) * 100,
            )
            ConsultationSession.objects.create(
                client=client, psychologist_profile=profiles[2], status="completed",
                scheduled_at=now - timedelta(days=6), duration_minutes=50,
                amount_kopecks=int(profiles[2].session_rate_rub) * 100, completed_at=now - timedelta(days=6),
            )

        self.stdout.write(self.style.SUCCESS(
            f"Готово. Пароль для всех: {PASSWORD}\n"
            f"  клиент: тихий-кит-0001\n  психолог: anna@demo.local\n  админ: admin"
        ))
