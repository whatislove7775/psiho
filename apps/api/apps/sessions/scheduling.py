"""
Расчёт свободных слотов и проверка возможности записи.

Правила расписания (PsychologistSchedule) заданы в московском времени
(settings.SCHEDULE_TIME_ZONE), weekday 0 = понедельник. Внутри окна правила
слоты начинаются каждые 60 минут и длятся 50 минут. Слот доступен, если он
начинается не раньше, чем через час, и не пересекается с неотменённой сессией.
"""
from datetime import date, datetime, timedelta
from datetime import timezone as dt_timezone
from zoneinfo import ZoneInfo

from django.conf import settings
from django.utils import timezone

from .models import ConsultationSession

SLOT_MINUTES = 50
SLOT_STEP = timedelta(minutes=60)
MIN_LEAD_TIME = timedelta(hours=1)
ALLOWED_DURATIONS = (50, 80)
MAX_SESSION_MINUTES = max(ALLOWED_DURATIONS)

NON_BLOCKING_STATUSES = (
    ConsultationSession.Status.CANCELLED,
    ConsultationSession.Status.REFUNDED,
)


def schedule_tz() -> ZoneInfo:
    return ZoneInfo(getattr(settings, "SCHEDULE_TIME_ZONE", "Europe/Moscow"))


def local_today() -> date:
    return timezone.now().astimezone(schedule_tz()).date()


def _active_rules(profile):
    return list(profile.schedule_slots.filter(is_active=True))


def _blocking_intervals(queryset, start: datetime, end: datetime):
    """[(start, end)] неотменённых сессий, пересекающих [start, end)."""
    qs = (
        queryset.exclude(status__in=NON_BLOCKING_STATUSES)
        .filter(
            scheduled_at__lt=end,
            scheduled_at__gt=start - timedelta(minutes=MAX_SESSION_MINUTES + 60),
        )
        .values_list("scheduled_at", "duration_minutes")
    )
    intervals = []
    for scheduled_at, duration in qs:
        s_end = scheduled_at + timedelta(minutes=duration)
        if s_end > start:
            intervals.append((scheduled_at, s_end))
    return intervals


def _overlaps(start: datetime, end: datetime, intervals) -> bool:
    return any(s < end and e > start for s, e in intervals)


def _rule_windows(rules, day: date, tz: ZoneInfo):
    for rule in rules:
        if rule.weekday != day.weekday():
            continue
        w_start = datetime.combine(day, rule.start_time, tzinfo=tz)
        w_end = datetime.combine(day, rule.end_time, tzinfo=tz)
        if w_end > w_start:
            yield w_start, w_end


def compute_slots(profile, from_date: date | None = None, days: int = 14, now: datetime | None = None,
                  limit: int | None = None):
    """Список свободных слотов [(start_utc, end_utc)] в хронологическом порядке."""
    tz = schedule_tz()
    now = now or timezone.now()
    from_date = from_date or now.astimezone(tz).date()
    earliest = now + MIN_LEAD_TIME
    rules = _active_rules(profile)
    if not rules or days <= 0:
        return []

    range_start = datetime.combine(from_date, datetime.min.time(), tzinfo=tz)
    range_end = range_start + timedelta(days=days + 1)
    busy = _blocking_intervals(
        ConsultationSession.objects.filter(psychologist_profile=profile), range_start, range_end
    )

    slots = set()
    for offset in range(days):
        day = from_date + timedelta(days=offset)
        for w_start, w_end in _rule_windows(rules, day, tz):
            start = w_start
            while start + timedelta(minutes=SLOT_MINUTES) <= w_end:
                end = start + timedelta(minutes=SLOT_MINUTES)
                if start >= earliest and not _overlaps(start, end, busy):
                    slots.add((start.astimezone(dt_timezone.utc), end.astimezone(dt_timezone.utc)))
                start += SLOT_STEP
    result = sorted(slots)
    if limit is not None:
        result = result[:limit]
    return result


def next_slot(profile, days: int = 14):
    slots = compute_slots(profile, days=days, limit=1)
    return slots[0][0] if slots else None


def check_bookable(profile, start: datetime, duration: int, client=None, now: datetime | None = None):
    """Возвращает None, если время можно забронировать, иначе текст ошибки."""
    now = now or timezone.now()
    if duration not in ALLOWED_DURATIONS:
        return "Длительность сессии может быть 50 или 80 минут."
    if timezone.is_naive(start):
        start = timezone.make_aware(start, dt_timezone.utc)
    if start < now + MIN_LEAD_TIME:
        return "Записаться можно не позднее чем за час до начала сессии."

    tz = schedule_tz()
    local = start.astimezone(tz)
    end = start + timedelta(minutes=duration)
    in_schedule = False
    for w_start, w_end in _rule_windows(_active_rules(profile), local.date(), tz):
        if local < w_start or end > w_end:
            continue
        if (local - w_start) % SLOT_STEP == timedelta(0):
            in_schedule = True
            break
    if not in_schedule:
        return "Специалист не принимает в это время. Выберите слот из расписания."

    busy = _blocking_intervals(
        ConsultationSession.objects.filter(psychologist_profile=profile), start, end
    )
    if _overlaps(start, end, busy):
        return "Это время уже занято. Выберите другой слот."

    if client is not None:
        own = _blocking_intervals(ConsultationSession.objects.filter(client=client), start, end)
        if _overlaps(start, end, own):
            return "У вас уже есть сессия в это время."
    return None
