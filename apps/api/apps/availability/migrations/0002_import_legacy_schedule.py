"""
Перенос существующих данных:
* для каждого специалиста создаются правила записи; цена часа = старая цена
  «за 50 минут» × 1.2 (округление до 10 ₽), так что цена 50-минутной сессии не меняется;
* активные правила users.PsychologistSchedule становятся основным недельным шаблоном
  (без дат действия). Старая таблица не удаляется — откат миграции безопасен.
Существующие сессии (sessions_consultation) не трогаем: они продолжают занимать время.
"""
from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.db import migrations


def _hourly(rate) -> int:
    if not rate:
        return 3600
    raw = Decimal(rate) * Decimal(60) / Decimal(50)
    return int((raw / 10).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * 10)


def forwards(apps, schema_editor):
    Profile = apps.get_model("users", "PsychologistProfile")
    Legacy = apps.get_model("users", "PsychologistSchedule")
    Settings = apps.get_model("availability", "AvailabilitySettings")
    Template = apps.get_model("availability", "WeeklyTemplate")
    Rule = apps.get_model("availability", "WeeklyRule")
    tz = getattr(settings, "SCHEDULE_TIME_ZONE", "Europe/Moscow")

    for profile in Profile.objects.all().iterator():
        if not Settings.objects.filter(profile_id=profile.pk).exists():
            Settings.objects.create(
                profile_id=profile.pk,
                time_zone=tz,
                min_duration=50,
                max_duration=180,
                durations=[50, 60, 80, 90, 120, 150, 180],
                buffer_minutes=10,
                min_notice_minutes=60,  # как было: не позднее чем за час
                horizon_days=28,
                start_step_minutes=30,
                hourly_rate_rub=_hourly(profile.session_rate_rub),
            )
        if Template.objects.filter(profile_id=profile.pk).exists():
            continue
        rules = [
            r for r in Legacy.objects.filter(psychologist_id=profile.pk, is_active=True)
            if (r.end_time.hour, r.end_time.minute) > (r.start_time.hour, r.start_time.minute)
        ]
        if not rules:
            continue
        template = Template.objects.create(profile_id=profile.pk)
        Rule.objects.bulk_create([
            Rule(
                template_id=template.pk,
                weekday=r.weekday,
                start_minute=r.start_time.hour * 60 + r.start_time.minute,
                end_minute=r.end_time.hour * 60 + r.end_time.minute,
            )
            for r in rules
        ])


def backwards(apps, schema_editor):
    # Старые правила остались в users_schedule — удаляем только новые данные.
    apps.get_model("availability", "WeeklyTemplate").objects.all().delete()
    apps.get_model("availability", "AvailabilitySettings").objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ("availability", "0001_initial"),
        ("users", "0003_secure_existing_accounts"),
    ]

    operations = [migrations.RunPython(forwards, backwards)]
