"""
Чистый расчёт свободного времени (без ORM) — легко тестировать.

Алгоритм для запрошенной длительности D:
1. Для каждой даты в часовом поясе специалиста определяем рабочие интервалы:
   отпуск → ничего; ручная настройка дня → её интервалы; иначе — недельный шаблон,
   действующий на эту дату.
2. Интервалы переводим в абсолютное время (UTC) и склеиваем соседние
   (в т.ч. через полночь: 20:00–24:00 + 00:00–02:00).
3. Кандидаты на начало: точки сетки (каждые step минут от полуночи) и моменты
   «сразу после занятой сессии + буфер» (округлённые до 5 минут) — чтобы сессии
   разной длины плотно укладывались.
4. Кандидат подходит, если [start, start + D) целиком внутри рабочего интервала,
   start ≥ now + notice, дата start не дальше горизонта, и с каждой занятой
   сессией [b0, b1) выполнено start ≥ b1 + buffer или start + D ≤ b0 − buffer.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from datetime import timezone as dt_timezone
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

DURATION_OPTIONS = (50, 60, 80, 90, 120, 150, 180)
BUFFER_OPTIONS = (0, 5, 10, 15, 20, 30, 45, 60)
NOTICE_OPTIONS = (60, 120, 180, 360, 720, 1440, 2880)  # минуты
HORIZON_OPTIONS = (7, 14, 21, 28, 42, 56, 84)  # дни
STEP_OPTIONS = (15, 30, 60)
DAY_MINUTES = 24 * 60
PACK_ROUND = 5

Range = tuple[int, int]  # минуты от полуночи, [start, end)
Interval = tuple[datetime, datetime]  # aware UTC


@dataclass
class Template:
    valid_from: date | None
    valid_until: date | None
    days: list[list[Range]]  # 7 списков, 0 = понедельник
    order: int = 0  # при равных valid_from побеждает больший

    def covers(self, d: date) -> bool:
        return (self.valid_from is None or self.valid_from <= d) and (
            self.valid_until is None or d <= self.valid_until
        )


@dataclass
class Availability:
    tz: ZoneInfo
    templates: list[Template] = field(default_factory=list)
    overrides: dict[date, list[Range]] = field(default_factory=dict)
    time_off: list[tuple[date, date]] = field(default_factory=list)
    durations: tuple[int, ...] = (50,)
    buffer: int = 10
    notice: int = 120
    horizon_days: int = 28
    step: int = 30


def round_price(hourly_rate_rub, minutes: int) -> int:
    """Цена сессии: пропорционально длительности, округление до 10 ₽ (половина — вверх)."""
    raw = Decimal(hourly_rate_rub) * Decimal(minutes) / Decimal(60)
    return int((raw / 10).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * 10)


def template_for(av: Availability, d: date) -> Template | None:
    best = None
    for t in av.templates:
        if not t.covers(d):
            continue
        key = (t.valid_from or date.min, t.order)
        if best is None or key > (best.valid_from or date.min, best.order):
            best = t
    return best


def day_plan(av: Availability, d: date) -> tuple[str, list[Range]]:
    """(источник, интервалы) для даты: time_off | override | template | none."""
    if any(a <= d <= b for a, b in av.time_off):
        return "time_off", []
    if d in av.overrides:
        return "override", sorted(av.overrides[d])
    t = template_for(av, d)
    if t is None:
        return "none", []
    return "template", sorted(t.days[d.weekday()])


def local_dt(d: date, minute: int, tz: ZoneInfo) -> datetime:
    """Настенное время `minute` минут от полуночи даты d (1440 = полночь следующего дня)."""
    d = d + timedelta(days=minute // DAY_MINUTES)
    minute %= DAY_MINUTES
    return datetime.combine(d, time(minute // 60, minute % 60), tzinfo=tz)


def to_utc(dt: datetime) -> datetime:
    return dt.astimezone(dt_timezone.utc)


def merge(intervals: list[Interval]) -> list[Interval]:
    out: list[Interval] = []
    for s, e in sorted(intervals):
        if e <= s:
            continue
        if out and s <= out[-1][1]:
            out[-1] = (out[-1][0], max(out[-1][1], e))
        else:
            out.append((s, e))
    return out


def windows(av: Availability, first: date, last: date) -> list[Interval]:
    """Склеенные рабочие интервалы (UTC) для дат first…last включительно."""
    raw: list[Interval] = []
    d = first
    while d <= last:
        _, ranges = day_plan(av, d)
        for s, e in ranges:
            raw.append((to_utc(local_dt(d, s, av.tz)), to_utc(local_dt(d, e, av.tz))))
        d += timedelta(days=1)
    return merge(raw)


def _ceil_to_grid(dt_local: datetime, step: int) -> datetime:
    midnight = dt_local.replace(hour=0, minute=0, second=0, microsecond=0)
    minutes = (dt_local - midnight).total_seconds() / 60
    k = -(-minutes // step)  # ceil
    return local_dt(midnight.date(), int(k * step), dt_local.tzinfo)


def _ceil_minutes(dt: datetime, n: int) -> datetime:
    dt = dt.replace(second=0, microsecond=0) + (timedelta(minutes=1) if dt.second or dt.microsecond else timedelta())
    extra = (-dt.minute) % n
    return dt + timedelta(minutes=extra)


def _conflicts(start: datetime, end: datetime, busy: list[Interval], buffer: timedelta) -> bool:
    return any(start < b1 + buffer and end + buffer > b0 for b0, b1 in busy)


def available_starts(
    av: Availability,
    duration: int,
    first: date,
    last: date,
    busy: list[Interval],
    now: datetime,
) -> list[datetime]:
    """Свободные начала (UTC, по возрастанию) для длительности `duration` в датах first…last."""
    if duration not in av.durations:
        return []
    today = now.astimezone(av.tz).date()
    horizon_last = today + timedelta(days=av.horizon_days)
    last = min(last, horizon_last)
    first = max(first, today)
    if first > last:
        return []

    earliest = now + timedelta(minutes=av.notice)
    dur = timedelta(minutes=duration)
    buf = timedelta(minutes=av.buffer)
    # окна смотрим на день шире, чтобы склеить интервалы через полночь
    wins = windows(av, first - timedelta(days=1), last + timedelta(days=1))
    range_start = to_utc(local_dt(first, 0, av.tz))
    range_end = to_utc(local_dt(last, DAY_MINUTES, av.tz))
    busy = sorted(busy)

    result: set[datetime] = set()
    for w0, w1 in wins:
        lo = max(w0, range_start, earliest)
        hi = min(w1, range_end)  # начало должно попасть в диапазон дат
        if lo >= hi or lo + dur > w1:
            continue
        candidates: set[datetime] = set()
        # сетка по местному времени
        t = to_utc(_ceil_to_grid(lo.astimezone(av.tz), av.step))
        while t < hi and t + dur <= w1:
            candidates.add(t)
            t = to_utc(_ceil_to_grid((t + timedelta(minutes=1)).astimezone(av.tz), av.step))
        # сразу после занятых сессий (+ буфер) и в начале окна
        extra = [w0] + [b1 + buf for _, b1 in busy if w0 <= b1 + buf < w1]
        for x in extra:
            x = _ceil_minutes(x, PACK_ROUND)
            if lo <= x < hi and x + dur <= w1:
                candidates.add(x)
        for c in candidates:
            if c >= earliest and not _conflicts(c, c + dur, busy, buf):
                result.add(c)
    return sorted(result)


def validate_ranges(ranges: list[Range]) -> str | None:
    for s, e in ranges:
        if not (0 <= s < e <= DAY_MINUTES):
            return "Конец интервала должен быть позже начала, в пределах суток."
        if s % 5 or e % 5:
            return "Время указывается с шагом 5 минут."
    ordered = sorted(ranges)
    for (_, e1), (s2, _) in zip(ordered, ordered[1:]):
        if s2 < e1:
            return "Интервалы в один день не должны пересекаться."
    return None
