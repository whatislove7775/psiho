"""ORM-обвязка над engine: загрузка правил, занятость, проверка записи, цена."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from datetime import timezone as dt_timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.conf import settings as dj_settings
from django.db import transaction
from django.utils import timezone

from . import engine
from .models import AvailabilitySettings, DateOverride, TimeOff, WeeklyRule, WeeklyTemplate

LEGACY_RATE_MINUTES = 50  # session_rate_rub исторически — цена 50 минут
MAX_BOOKED_MINUTES = max(engine.DURATION_OPTIONS)


def _blocking_statuses_excluded():
    from apps.sessions.models import ConsultationSession

    return (ConsultationSession.Status.CANCELLED, ConsultationSession.Status.REFUNDED)


def safe_zone(name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(name or dj_settings.SCHEDULE_TIME_ZONE)
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo(getattr(dj_settings, "SCHEDULE_TIME_ZONE", "Europe/Moscow"))


def legacy_hourly_rate(session_rate_rub) -> int:
    """Цена часа из старой цены «за 50 минут» (сохраняет цену 50-минутной сессии): rate × 60/50."""
    if not session_rate_rub:
        return 3600
    # round_price(x, m) = x·m/60 → при m = 72 получаем x·1.2, округлённое до 10 ₽
    return engine.round_price(session_rate_rub, 60 * 60 // LEGACY_RATE_MINUTES)


def import_legacy_schedule(profile) -> WeeklyTemplate | None:
    """Переносит старые правила PsychologistSchedule в недельный шаблон без дат."""
    rules = list(profile.schedule_slots.filter(is_active=True))
    if not rules:
        return None
    template = WeeklyTemplate.objects.create(profile=profile)
    WeeklyRule.objects.bulk_create([
        WeeklyRule(
            template=template,
            weekday=r.weekday,
            start_minute=r.start_time.hour * 60 + r.start_time.minute,
            end_minute=r.end_time.hour * 60 + r.end_time.minute,
        )
        for r in rules
        if (r.end_time.hour * 60 + r.end_time.minute) > (r.start_time.hour * 60 + r.start_time.minute)
    ])
    return template


def get_settings(profile) -> AvailabilitySettings:
    cached = getattr(profile, "_availability_settings", None)
    if cached is not None:
        return cached
    obj = AvailabilitySettings.objects.filter(profile=profile).first()
    if obj is None:
        with transaction.atomic():
            obj, created = AvailabilitySettings.objects.get_or_create(
                profile=profile,
                defaults={"hourly_rate_rub": legacy_hourly_rate(profile.session_rate_rub)},
            )
            if created and not WeeklyTemplate.objects.filter(profile=profile).exists():
                import_legacy_schedule(profile)
    profile._availability_settings = obj
    return obj


def allowed_durations(s: AvailabilitySettings) -> tuple[int, ...]:
    values = sorted({int(d) for d in (s.durations or []) if s.min_duration <= int(d) <= s.max_duration})
    return tuple(values) or (s.min_duration,)


def price_for(profile, minutes: int) -> int:
    return engine.round_price(get_settings(profile).hourly_rate_rub, minutes)


def price_from(s: AvailabilitySettings) -> int:
    return engine.round_price(s.hourly_rate_rub, allowed_durations(s)[0])


def sync_profile_rate(s: AvailabilitySettings) -> None:
    """profile.session_rate_rub = цена самой короткой сессии («от …»): его читают списки и фильтры."""
    from apps.users.models import PsychologistProfile

    value = price_from(s)
    PsychologistProfile.objects.filter(pk=s.profile_id).update(session_rate_rub=value)
    s.profile.session_rate_rub = value


def set_rate_from_legacy(profile) -> None:
    """Старый PATCH профиля с session_rate_rub (цена самой короткой сессии) → новая цена часа."""
    s = get_settings(profile)
    shortest = allowed_durations(s)[0]
    s.hourly_rate_rub = engine.round_price(profile.session_rate_rub, 60 * 60 // shortest)
    s.save(update_fields=["hourly_rate_rub", "updated_at"])
    sync_profile_rate(s)


def booking_info(profile) -> dict:
    s = get_settings(profile)
    durations = allowed_durations(s)
    return {
        "hourly_rate_rub": s.hourly_rate_rub,
        "min_duration": durations[0],
        "max_duration": durations[-1],
        "durations": [{"minutes": d, "price_rub": engine.round_price(s.hourly_rate_rub, d)} for d in durations],
    }


def templates_of(profile) -> list[WeeklyTemplate]:
    return list(WeeklyTemplate.objects.filter(profile=profile).prefetch_related("rules").order_by("valid_from", "id"))


def to_engine_template(t: WeeklyTemplate) -> engine.Template:
    days: list[list[engine.Range]] = [[] for _ in range(7)]
    for r in t.rules.all():
        if 0 <= r.weekday <= 6:
            days[r.weekday].append((r.start_minute, r.end_minute))
    return engine.Template(t.valid_from, t.valid_until, days, order=t.id or 0)


def load(profile, first: date | None = None, last: date | None = None) -> engine.Availability:
    s = get_settings(profile)
    overrides = DateOverride.objects.filter(profile=profile)
    time_off = TimeOff.objects.filter(profile=profile)
    if first and last:
        overrides = overrides.filter(date__gte=first - timedelta(days=1), date__lte=last + timedelta(days=1))
        time_off = time_off.filter(end_date__gte=first - timedelta(days=1), start_date__lte=last + timedelta(days=1))
    return engine.Availability(
        tz=safe_zone(s.time_zone),
        templates=[to_engine_template(t) for t in templates_of(profile)],
        overrides={o.date: [tuple(r) for r in o.ranges] for o in overrides},
        time_off=[(t.start_date, t.end_date) for t in time_off],
        durations=allowed_durations(s),
        buffer=s.buffer_minutes,
        notice=s.min_notice_minutes,
        horizon_days=s.horizon_days,
        step=s.start_step_minutes,
    )


def busy_intervals(queryset, start: datetime, end: datetime) -> list[engine.Interval]:
    """[(start, end)] неотменённых сессий, пересекающих [start, end)."""
    qs = (
        queryset.exclude(status__in=_blocking_statuses_excluded())
        .filter(scheduled_at__lt=end, scheduled_at__gt=start - timedelta(minutes=MAX_BOOKED_MINUTES + 240))
        .values_list("scheduled_at", "duration_minutes")
    )
    out = []
    for scheduled_at, duration in qs:
        s_end = scheduled_at + timedelta(minutes=duration)
        if s_end > start:
            out.append((scheduled_at.astimezone(dt_timezone.utc), s_end.astimezone(dt_timezone.utc)))
    return out


def local_today(profile=None, now: datetime | None = None) -> date:
    tz = safe_zone(get_settings(profile).time_zone) if profile is not None else safe_zone(None)
    return (now or timezone.now()).astimezone(tz).date()


def starts_for(profile, duration: int, first: date, last: date, now: datetime | None = None) -> list[datetime]:
    from apps.sessions.models import ConsultationSession

    now = now or timezone.now()
    av = load(profile, first, last)
    pad = timedelta(days=1, minutes=MAX_BOOKED_MINUTES + 120)
    busy = busy_intervals(
        ConsultationSession.objects.filter(psychologist_profile=profile),
        engine.to_utc(engine.local_dt(first, 0, av.tz)) - pad,
        engine.to_utc(engine.local_dt(last, engine.DAY_MINUTES, av.tz)) + pad,
    )
    return engine.available_starts(av, duration, first, last, busy, now)


def next_start(profile, now: datetime | None = None) -> datetime | None:
    s = get_settings(profile)
    duration = allowed_durations(s)[0]
    today = local_today(profile, now)
    first = today
    while (first - today).days <= s.horizon_days:
        last = first + timedelta(days=6)
        found = starts_for(profile, duration, first, last, now)
        if found:
            return found[0]
        first = last + timedelta(days=1)
    return None


def check_bookable(profile, start: datetime, duration: int, client=None, now: datetime | None = None) -> str | None:
    """None, если время можно забронировать, иначе понятный текст ошибки."""
    from apps.sessions.models import ConsultationSession

    now = now or timezone.now()
    s = get_settings(profile)
    durations = allowed_durations(s)
    if duration not in durations:
        return f"Специалист проводит созвоны длительностью {human_list(durations)} минут."
    if timezone.is_naive(start):
        start = timezone.make_aware(start, dt_timezone.utc)
    start = start.astimezone(dt_timezone.utc)
    if start < now + timedelta(minutes=s.min_notice_minutes):
        return f"Записаться можно не позднее чем за {human_notice(s.min_notice_minutes)} до начала созвона."
    tz = safe_zone(s.time_zone)
    local_date = start.astimezone(tz).date()
    if local_date > local_today(profile, now) + timedelta(days=s.horizon_days):
        return f"Специалист открывает запись на {s.horizon_days} {plural(s.horizon_days, 'день', 'дня', 'дней')} вперёд."
    if start not in starts_for(profile, duration, local_date, local_date, now):
        busy = busy_intervals(
            ConsultationSession.objects.filter(psychologist_profile=profile),
            start - timedelta(minutes=s.buffer_minutes),
            start + timedelta(minutes=duration + s.buffer_minutes),
        )
        if busy:
            return "Это время уже занято. Выберите другое."
        return "Специалист не принимает в это время. Выберите время из списка свободных."
    if client is not None:
        own = busy_intervals(
            ConsultationSession.objects.filter(client=client), start, start + timedelta(minutes=duration)
        )
        if own:
            return "У вас уже есть созвон в это время."
    return None


# ── Форматирование ──────────────────────────────────────────────

def plural(n: int, one: str, few: str, many: str) -> str:
    a, b = abs(n) % 100, abs(n) % 10
    if 10 < a < 20:
        return many
    if 1 < b < 5:
        return few
    if b == 1:
        return one
    return many


def human_list(values) -> str:
    items = [str(v) for v in values]
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " или " + items[-1]


def human_notice(minutes: int) -> str:
    if minutes % 1440 == 0:
        d = minutes // 1440
        return f"{d} {plural(d, 'сутки', 'суток', 'суток')}"
    if minutes % 60 == 0:
        h = minutes // 60
        return f"{h} {plural(h, 'час', 'часа', 'часов')}"
    return f"{minutes} минут"


def hhmm(minute: int) -> str:
    return f"{minute // 60:02d}:{minute % 60:02d}"


def parse_hhmm(value: str) -> int:
    h, m = str(value).strip().split(":")[:2]
    h, m = int(h), int(m)
    if not (0 <= m < 60 and 0 <= h <= 24) or (h == 24 and m):
        raise ValueError(value)
    return h * 60 + m


# ── Совместимость со старым API /psychologist/schedule/ ──────────

def legacy_rules(profile, on: date | None = None) -> list[dict]:
    """Правила шаблона, действующего сегодня, в старом формате (start_time/end_time)."""
    av = load(profile)
    t = engine.template_for(av, on or local_today(profile))
    if t is None:
        return []
    return [
        {"weekday": wd, "start_time": hhmm(s), "end_time": hhmm(min(e, engine.DAY_MINUTES - 1))}
        for wd, ranges in enumerate(t.days)
        for s, e in sorted(ranges)
    ]


@transaction.atomic
def replace_default_template(profile, rules: list[dict]) -> None:
    """Старый PUT: заменяет правила основного шаблона (без дат)."""
    get_settings(profile)
    template = (
        WeeklyTemplate.objects.filter(profile=profile, valid_from__isnull=True, valid_until__isnull=True)
        .order_by("id").first()
    ) or WeeklyTemplate.objects.create(profile=profile)
    template.rules.all().delete()
    WeeklyRule.objects.bulk_create([
        WeeklyRule(
            template=template,
            weekday=r["weekday"],
            start_minute=r["start_time"].hour * 60 + r["start_time"].minute,
            end_minute=r["end_time"].hour * 60 + r["end_time"].minute,
        )
        for r in rules
    ])
