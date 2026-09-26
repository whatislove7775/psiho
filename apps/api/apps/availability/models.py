"""
Доступность специалиста
-----------------------
* AvailabilitySettings — правила записи: часовой пояс, длительности, буфер между
  сессиями, минимальное время до записи, горизонт записи, шаг начала, цена часа.
* WeeklyTemplate + WeeklyRule — повторяющееся недельное расписание. Шаблонов может
  быть несколько (например, «летнее» с 1 июня по 31 августа); на конкретную дату
  действует шаблон с самой поздней датой начала среди подходящих.
* DateOverride — ручная настройка одного дня: заменяет шаблон (пустой список = выходной).
* TimeOff — отпуск: целые дни, в которые запись закрыта при любых других правилах.

Интервалы хранятся в минутах от полуночи по часовому поясу специалиста (0…1440),
чтобы можно было работать «до 24:00».
"""
from django.conf import settings
from django.db import models


def default_time_zone() -> str:
    return getattr(settings, "SCHEDULE_TIME_ZONE", "Europe/Moscow")


def default_durations() -> list[int]:
    from .engine import DURATION_OPTIONS

    return list(DURATION_OPTIONS)


class AvailabilitySettings(models.Model):
    profile = models.OneToOneField(
        "users.PsychologistProfile", on_delete=models.CASCADE, related_name="availability"
    )
    time_zone = models.CharField(max_length=64, default=default_time_zone)
    # Длительности сессий, которые можно выбрать при записи (минуты)
    min_duration = models.PositiveSmallIntegerField(default=50)
    max_duration = models.PositiveSmallIntegerField(default=180)
    durations = models.JSONField(default=default_durations)
    buffer_minutes = models.PositiveSmallIntegerField(default=10)
    min_notice_minutes = models.PositiveIntegerField(default=120)
    horizon_days = models.PositiveSmallIntegerField(default=28)
    start_step_minutes = models.PositiveSmallIntegerField(default=30)
    # Цена часа; стоимость сессии пропорциональна длительности, округление до 10 ₽
    hourly_rate_rub = models.PositiveIntegerField(default=3600)
    # «Знакомство, 15 минут»: короткий первый созвон по своей фиксированной цене (0 — бесплатно).
    # Выключено по умолчанию; 15 минут разрешены только для знакомства (engine.INTRO_MINUTES).
    intro_enabled = models.BooleanField(default=False)
    intro_price_rub = models.PositiveIntegerField(default=0)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "availability_settings"
        verbose_name = "Правила записи"

    def __str__(self):
        return f"Availability<{self.profile_id}>"


class WeeklyTemplate(models.Model):
    profile = models.ForeignKey(
        "users.PsychologistProfile", on_delete=models.CASCADE, related_name="weekly_templates"
    )
    valid_from = models.DateField(null=True, blank=True)
    valid_until = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "availability_weekly_template"
        ordering = ["valid_from", "id"]


class WeeklyRule(models.Model):
    template = models.ForeignKey(WeeklyTemplate, on_delete=models.CASCADE, related_name="rules")
    weekday = models.PositiveSmallIntegerField()  # 0 = понедельник
    start_minute = models.PositiveSmallIntegerField()
    end_minute = models.PositiveSmallIntegerField()

    class Meta:
        db_table = "availability_weekly_rule"
        ordering = ["weekday", "start_minute"]


class DateOverride(models.Model):
    profile = models.ForeignKey(
        "users.PsychologistProfile", on_delete=models.CASCADE, related_name="date_overrides"
    )
    date = models.DateField()
    # [[start_minute, end_minute], ...]; [] — выходной
    ranges = models.JSONField(default=list)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "availability_date_override"
        ordering = ["date"]
        constraints = [
            models.UniqueConstraint(fields=["profile", "date"], name="availability_override_unique_date"),
        ]


class TimeOff(models.Model):
    profile = models.ForeignKey(
        "users.PsychologistProfile", on_delete=models.CASCADE, related_name="time_off"
    )
    start_date = models.DateField()
    end_date = models.DateField()
    note = models.CharField(max_length=80, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "availability_time_off"
        ordering = ["start_date"]
