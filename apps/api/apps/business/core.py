"""Общие помощники B2B: порог k-анонимности, месяцы и периоды программ, коды, темы."""
from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import date
from zoneinfo import ZoneInfo

from django.conf import settings
from django.utils import timezone

from apps.billing.crypto import _derived

# Меньше пяти человек — никаких чисел: «менее 5». Ниже 5 порог опустить нельзя.
K_MIN = 5


def k_threshold() -> int:
    return max(K_MIN, int(getattr(settings, "BUSINESS_K_ANONYMITY", K_MIN) or K_MIN))


def _tz():
    return ZoneInfo(getattr(settings, "SCHEDULE_TIME_ZONE", "Europe/Moscow") or "Europe/Moscow")


def today() -> date:
    return timezone.now().astimezone(_tz()).date()


def month_start(d: date | None = None) -> date:
    d = d or today()
    return d.replace(day=1)


def add_months(d: date, n: int) -> date:
    y, m = divmod(d.month - 1 + n, 12)
    return date(d.year + y, m + 1, 1)


def period_bounds(period: str, d: date | None = None) -> tuple[date, date]:
    """[начало, конец) текущего периода программы по календарю (месяц / квартал / год)."""
    d = d or today()
    if period == "year":
        start = date(d.year, 1, 1)
        return start, date(d.year + 1, 1, 1)
    if period == "quarter":
        start = date(d.year, ((d.month - 1) // 3) * 3 + 1, 1)
        return start, add_months(start, 3)
    start = month_start(d)
    return start, add_months(start, 1)


def month_start_dt(d: date):
    """Полночь первого числа месяца в часовом поясе сервиса (aware datetime)."""
    from datetime import datetime

    return datetime(d.year, d.month, 1, tzinfo=_tz())


# ── Коды сотрудников ──────────────────────────────────────────────

CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
CODE_PREFIX = "BIZ"


def normalize_code(raw: str) -> str:
    s = "".join(ch for ch in (raw or "").upper() if ch.isalnum())
    if s.startswith(CODE_PREFIX) or s.startswith("B1Z"):
        s = s[len(CODE_PREFIX):]
    return s.replace("O", "0").replace("I", "1").replace("L", "1")


def new_code_core() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(12))


def format_code(core: str) -> str:
    return f"{CODE_PREFIX}-" + "-".join(core[i:i + 4] for i in range(0, len(core), 4))


def _hmac(info: bytes, core: str) -> str:
    key = _derived(settings.SECRET_KEY, info)
    return hmac.new(key, core.encode("utf-8"), hashlib.sha256).hexdigest()


def code_hash(core: str) -> str:
    """Поиск кода при активации."""
    return _hmac(b"business-codes", core)


def enrollment_ref(core: str) -> str:
    """Связь «код → участник» другим ключом: по базе строки не сопоставить."""
    return _hmac(b"business-enrollment", core)


# ── Темы (по направлению специалиста, грубые категории) ───────────

TOPICS = {
    "anxiety": "Тревога и стресс",
    "burnout": "Выгорание и работа",
    "relations": "Отношения и семья",
    "mood": "Настроение и одиночество",
    "self": "Самооценка",
    "sleep": "Сон",
    "circles": "Групповые «Круги»",
    "other": "Другое",
}
_TOPIC_WORDS = [
    ("anxiety", ("тревог", "паник", "стресс", "страх")),
    ("burnout", ("выгора", "работ", "карьер", "профес")),
    ("relations", ("отношен", "семь", "пар", "развод", "родит", "дет", "подрост")),
    ("mood", ("депресс", "одиноч", "горе", "утрат", "настроен")),
    ("self", ("самооцен", "уверен", "самоопредел")),
    ("sleep", ("сон", "бессон")),
]


def topic_for(specializations) -> str:
    for spec in specializations or []:
        low = str(spec).lower()
        for key, words in _TOPIC_WORDS:
            if any(w in low for w in words):
                return key
    return "other"
