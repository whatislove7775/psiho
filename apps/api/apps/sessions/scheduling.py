"""
Совместимый фасад над apps.availability (гибкое расписание специалиста).

Правила записи, недельные шаблоны, особые дни, отпуска, буфер, длительности и цена
живут в apps.availability; здесь — функции, которые исторически импортируют другие
модули (serializers, stats, adminpanel).
"""
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.utils import timezone

from apps.availability import services as availability


def schedule_tz() -> ZoneInfo:
    """Часовой пояс платформы по умолчанию (для статистики «за месяц/сегодня»)."""
    return ZoneInfo(getattr(settings, "SCHEDULE_TIME_ZONE", "Europe/Moscow"))


def local_today() -> date:
    return timezone.now().astimezone(schedule_tz()).date()


def compute_slots(profile, from_date: date | None = None, days: int = 14, now: datetime | None = None,
                  limit: int | None = None, duration: int | None = None):
    """Свободные интервалы [(start_utc, end_utc)] для длительности (по умолчанию — самой короткой)."""
    if days <= 0:
        return []
    s = availability.get_settings(profile)
    duration = duration or availability.allowed_durations(s)[0]
    first = from_date or availability.local_today(profile, now)
    last = first + timedelta(days=days - 1)
    starts = availability.starts_for(profile, duration, first, last, now)
    result = [(x, x + timedelta(minutes=duration)) for x in starts]
    return result[:limit] if limit is not None else result


def next_slot(profile, days: int = 14):
    return availability.next_start(profile)


def check_bookable(profile, start: datetime, duration: int, client=None, now: datetime | None = None):
    return availability.check_bookable(profile, start, duration, client=client, now=now)
