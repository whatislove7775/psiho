from datetime import datetime, timedelta

from .scheduling import schedule_tz


def month_start_utc(now: datetime) -> datetime:
    """Начало текущего месяца по московскому времени."""
    local = now.astimezone(schedule_tz())
    return local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def day_bounds_utc(now: datetime) -> tuple[datetime, datetime]:
    """Границы текущих суток по московскому времени."""
    local = now.astimezone(schedule_tz())
    start = local.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, start + timedelta(days=1)
