"""
Свободные начала сразу для многих специалистов (каталог и поиск).

`services.starts_for` делает 4–5 запросов на специалиста; для списка из N
специалистов это N×5 запросов и ещё столько же для `next_slot`. Здесь все
правила, особые дни, отпуска и занятость грузятся одним запросом на таблицу,
а расчёт идёт в памяти тем же движком (`engine.available_starts`).
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from datetime import timezone as dt_timezone

from django.utils import timezone

from . import engine
from .models import AvailabilitySettings, DateOverride, TimeOff, WeeklyTemplate
from .services import (
    MAX_BOOKED_MINUTES, _blocking_statuses_excluded, allowed_durations, get_settings, safe_zone,
    to_engine_template,
)


@dataclass
class Plan:
    """Всё, что нужно движку для одного специалиста."""

    av: engine.Availability
    settings: AvailabilitySettings
    busy: list[engine.Interval]

    @property
    def durations(self) -> tuple[int, ...]:
        return self.av.durations

    def starts(self, duration: int | None, first: date, last: date, now: datetime) -> list[datetime]:
        duration = duration or self.av.durations[0]
        return engine.available_starts(self.av, duration, first, last, self.busy, now)

    def today(self, now: datetime) -> date:
        return now.astimezone(self.av.tz).date()

    def next_start(self, duration: int | None, now: datetime, scanned_until: date | None = None,
                   known: list[datetime] | None = None) -> datetime | None:
        """Ближайшее начало в пределах горизонта записи.

        `known` — уже посчитанные начала до `scanned_until` включительно (чтобы не считать дважды)."""
        if known:
            return known[0]
        today = self.today(now)
        first = (scanned_until + timedelta(days=1)) if scanned_until else today
        limit = today + timedelta(days=self.av.horizon_days)
        while first <= limit:
            last = first + timedelta(days=6)
            found = self.starts(duration, first, last, now)
            if found:
                return found[0]
            first = last + timedelta(days=1)
        return None


def load_plans(profiles, now: datetime | None = None) -> dict[int, Plan]:
    """{profile.id: Plan} за фиксированное число запросов (не зависит от числа специалистов)."""
    from apps.sessions.models import ConsultationSession

    profiles = list(profiles)
    if not profiles:
        return {}
    now = now or timezone.now()
    ids = [p.id for p in profiles]

    settings_by_id = {s.profile_id: s for s in AvailabilitySettings.objects.filter(profile_id__in=ids)}
    for p in profiles:
        s = settings_by_id.get(p.id)
        if s is None:  # старый профиль без настроек: создаём как раньше (одноразово)
            s = get_settings(p)
            settings_by_id[p.id] = s
        s.profile = p
        p._availability_settings = s  # booking_info / get_settings больше не ходят в БД

    templates: dict[int, list[WeeklyTemplate]] = defaultdict(list)
    for t in WeeklyTemplate.objects.filter(profile_id__in=ids).prefetch_related("rules").order_by("valid_from", "id"):
        templates[t.profile_id].append(t)

    max_horizon = max((s.horizon_days for s in settings_by_id.values()), default=28)
    # даты в местном времени специалистов: берём с запасом в сутки
    first = (now - timedelta(days=2)).date()
    last = (now + timedelta(days=max_horizon + 2)).date()

    overrides: dict[int, dict[date, list]] = defaultdict(dict)
    for o in DateOverride.objects.filter(profile_id__in=ids, date__gte=first, date__lte=last):
        overrides[o.profile_id][o.date] = [tuple(r) for r in o.ranges]

    time_off: dict[int, list[tuple[date, date]]] = defaultdict(list)
    for t in TimeOff.objects.filter(profile_id__in=ids, end_date__gte=first, start_date__lte=last):
        time_off[t.profile_id].append((t.start_date, t.end_date))

    busy: dict[int, list[engine.Interval]] = defaultdict(list)
    window_start = now - timedelta(days=1, minutes=MAX_BOOKED_MINUTES + 240)
    window_end = now + timedelta(days=max_horizon + 3)
    rows = (
        ConsultationSession.objects.filter(psychologist_profile_id__in=ids)
        .exclude(status__in=_blocking_statuses_excluded())
        .filter(scheduled_at__lt=window_end, scheduled_at__gt=window_start)
        .values_list("psychologist_profile_id", "scheduled_at", "duration_minutes")
    )
    for pid, scheduled_at, duration in rows:
        start = scheduled_at.astimezone(dt_timezone.utc)
        busy[pid].append((start, start + timedelta(minutes=duration)))

    plans: dict[int, Plan] = {}
    for p in profiles:
        s = settings_by_id[p.id]
        av = engine.Availability(
            tz=safe_zone(s.time_zone),
            templates=[to_engine_template(t) for t in templates.get(p.id, [])],
            overrides=overrides.get(p.id, {}),
            time_off=time_off.get(p.id, []),
            durations=allowed_durations(s),
            buffer=s.buffer_minutes,
            notice=s.min_notice_minutes,
            horizon_days=s.horizon_days,
            step=s.start_step_minutes,
        )
        plans[p.id] = Plan(av=av, settings=s, busy=sorted(busy.get(p.id, [])))
    return plans
