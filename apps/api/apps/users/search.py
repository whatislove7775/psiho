"""
Поиск специалистов: текст + фильтры + ближайшее свободное время.

Используется списком `/api/v1/psychologists/` (совместимый массив) и палитрой
поиска `/api/v1/psychologists/search/` (`{count, results}` с лимитом).
Поисковые запросы нигде не сохраняются и не логируются — это приватные данные.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.conf import settings
from django.utils import timezone

# ── Справочники ────────────────────────────────────────────────────

# Подходы: ключ → (подпись, фрагменты, по которым узнаём подход в свободном тексте «approach»)
APPROACHES: dict[str, tuple[str, tuple[str, ...]]] = {
    "cbt": ("КПТ", ("кпт", "когнитивно-поведен", "когнитивно поведен", "cbt")),
    "act": ("ACT", ("act", "терапия принятия", "принятия и ответственности")),
    "gestalt": ("Гештальт", ("гештальт",)),
    "eft": ("Эмоционально-фокусированная", ("эмоционально-фокус", "эмоционально фокус", "eft", "эфт")),
    "schema": ("Схема-терапия", ("схема-терап", "схема терап", "схемн")),
    "psychodynamic": ("Психодинамический", ("психодинам", "психоанал")),
    "existential": ("Экзистенциальный", ("экзистенц",)),
    "systemic": ("Системная семейная", ("системн", "семейная терап")),
    "mi": ("Мотивационное интервью", ("мотивационн",)),
    "emdr": ("EMDR", ("emdr", "дпдг")),
    "ba": ("Поведенческая активация", ("поведенческая активац",)),
}

WHEN = {
    "today": "Сегодня",
    "3days": "Ближайшие 3 дня",
    "evening": "Вечером",
    "weekend": "Выходные",
}
EVENING_FROM_HOUR = 18
WHEN_WINDOW_DAYS = 14  # «вечером» и «выходные» — в ближайшие две недели

GENDERS = ("female", "male")
SORTS = ("relevance", "soon", "price", "experience")

# Если человек забыл переключить раскладку: «nhtdjuf» → «тревога»
_EN = "`qwertyuiop[]asdfghjkl;'zxcvbnm,."
_RU = "ёйцукенгшщзхъфывапролджэячсмитьбю"
_LAYOUT = str.maketrans(_EN, _RU)
_WORD = re.compile(r"[\w\-]+", re.UNICODE)


def fold(text) -> str:
    return str(text or "").casefold().replace("ё", "е")


def stem(token: str) -> str:
    """Грубое усечение окончаний: «тревожность» и «тревога» → «трево», «паника» → «пани»."""
    if len(token) <= 4:
        return token
    return token[:5] if len(token) >= 7 else token[:4]


def tokens(q: str) -> list[str]:
    return [t for t in _WORD.findall(fold(q)) if len(t) >= 2][:8]


def approach_keys(text: str) -> set[str]:
    t = fold(text)
    return {key for key, (_, needles) in APPROACHES.items() if any(_has(t, n) for n in needles)}


def _has(haystack: str, needle: str) -> bool:
    # латинские аббревиатуры (act, eft) — только целым словом, чтобы «act» не находился в «contact»
    if needle.isascii() and len(needle) <= 4:
        return re.search(rf"(?<![a-z]){re.escape(needle)}(?![a-z])", haystack) is not None
    return needle in haystack


# ── Параметры ──────────────────────────────────────────────────────

class BadQuery(ValueError):
    pass


@dataclass
class Query:
    q: str = ""
    topics: list[str] = field(default_factory=list)
    approach: str = ""
    max_rate: int | None = None
    when: str = ""
    duration: int | None = None
    min_experience: int | None = None
    gender: str = ""
    language: str = ""
    sort: str = "relevance"
    tz: ZoneInfo | None = None

    @property
    def needs_starts(self) -> bool:
        return bool(self.when)

    @property
    def is_empty(self) -> bool:
        return not (self.q or self.topics or self.approach or self.max_rate or self.when or self.duration
                    or self.min_experience or self.gender or self.language)


def _int(params, name, lo=0, hi=1_000_000) -> int | None:
    raw = (params.get(name) or "").strip()
    if not raw:
        return None
    try:
        value = int(raw)
    except ValueError:
        raise BadQuery(f"{name} должен быть числом.")
    if not lo <= value <= hi:
        raise BadQuery(f"{name} вне допустимого диапазона.")
    return value


def parse(params) -> Query:
    from apps.availability.engine import DURATION_OPTIONS

    topics: list[str] = []
    for raw in params.getlist("topic") + [params.get("topics") or "", params.get("specialization") or ""]:
        for part in str(raw).split(","):
            part = part.strip()[:60]
            if part and fold(part) not in {fold(t) for t in topics}:
                topics.append(part)
    approach = (params.get("approach") or "").strip()
    if approach and approach not in APPROACHES:
        raise BadQuery("Неизвестный подход.")
    when = (params.get("when") or "").strip()
    if when and when not in WHEN:
        raise BadQuery("when: today, 3days, evening или weekend.")
    duration = _int(params, "duration")
    if duration is not None and duration not in DURATION_OPTIONS:
        raise BadQuery("Такой длительности созвона нет.")
    gender = (params.get("gender") or "").strip()
    if gender and gender not in GENDERS:
        raise BadQuery("gender: female или male.")
    sort = (params.get("sort") or "relevance").strip()
    if sort not in SORTS:
        raise BadQuery("sort: relevance, soon, price или experience.")
    tz = None
    raw_tz = (params.get("tz") or "").strip()
    if raw_tz:
        try:
            tz = ZoneInfo(raw_tz[:64])
        except (ZoneInfoNotFoundError, ValueError):
            tz = None  # неизвестный пояс — не ошибка, считаем по времени платформы
    return Query(
        q=(params.get("q") or "").strip()[:120],
        topics=topics[:10],
        approach=approach,
        max_rate=_int(params, "max_rate"),
        when=when,
        duration=duration,
        min_experience=_int(params, "min_experience", 0, 80),
        gender=gender,
        language=(params.get("language") or "").strip()[:40],
        sort=sort,
        tz=tz,
    )


# ── Подбор ─────────────────────────────────────────────────────────

@dataclass
class Hit:
    profile: object
    score: float = 0.0
    next_start: datetime | None = None
    price: int = 0


def _words(text: str) -> list[str]:
    return re.findall(r"\w+", text)


def text_score(profile, words: list[str]) -> float | None:
    """None — не подходит; иначе вес совпадения (имя > тема > подход > о себе).

    Совпадение — по началу слова («анна» не находится внутри «фокусированная»)."""
    fields = (
        (_words(fold(profile.display_name)), 6.0),
        (_words(" ".join(fold(s) for s in profile.specializations or [])), 4.0),
        (_words(fold(profile.approach)), 2.0),
        (_words(fold(profile.bio)), 1.0),
        (_words(" ".join(fold(s) for s in profile.languages or [])), 1.0),
    )
    profile_approaches = approach_keys(profile.approach)
    total = 0.0
    for word in words:
        variants = {word, word.translate(_LAYOUT)} if word.isascii() else {word}
        best = 0.0
        for v in variants:
            parts = [x for x in re.split(r"-", v) if x]  # «схема-терапия» → оба слова
            for text, weight in fields:
                if all(any(w.startswith(x) or w.startswith(stem(x)) for w in text) for x in parts):
                    exact = all(any(w.startswith(x) for w in text) for x in parts)
                    best = max(best, weight + (1.0 if exact else 0.0))
            if approach_keys(v) & profile_approaches:  # «кпт» находит «когнитивно-поведенческая»
                best = max(best, 3.0)
        if best == 0.0:
            return None
        total += best
    return total


def when_matches(when: str, starts: list[datetime], tz: ZoneInfo, now: datetime) -> bool:
    today = now.astimezone(tz).date()
    for s in starts:
        local = s.astimezone(tz)
        d = local.date()
        if when == "today" and d == today:
            return True
        if when == "3days" and d <= today + timedelta(days=2):
            return True
        if when == "evening" and local.hour >= EVENING_FROM_HOUR:
            return True
        if when == "weekend" and local.weekday() >= 5:
            return True
    return False


def search(profiles, query: Query, now: datetime | None = None) -> list[Hit]:
    """Фильтрует и сортирует уже загруженные профили; ближайшее время — пакетно."""
    from apps.availability import bulk, engine

    now = now or timezone.now()
    tz = query.tz or ZoneInfo(getattr(settings, "SCHEDULE_TIME_ZONE", "Europe/Moscow"))
    words = tokens(query.q)
    topics = {fold(t) for t in query.topics}
    language = fold(query.language)

    hits: list[Hit] = []
    for p in profiles:
        if query.min_experience and (p.experience_years or 0) < query.min_experience:
            continue
        if query.gender and p.gender != query.gender:
            continue
        if language and not any(fold(x) == language for x in p.languages or []):
            continue
        if query.approach and query.approach not in approach_keys(p.approach):
            continue
        score = 0.0
        if topics:
            mine = {fold(s) for s in p.specializations or []}
            matched = len(topics & mine)
            if not matched:
                continue
            score += 5.0 * matched
        if words:
            ts = text_score(p, words)
            if ts is None:
                continue
            score += ts
        hits.append(Hit(profile=p, score=score))

    plans = bulk.load_plans([h.profile for h in hits], now)
    kept: list[Hit] = []
    for h in hits:
        plan = plans[h.profile.id]
        if query.duration and query.duration not in plan.durations:
            continue
        h.price = engine.round_price(plan.settings.hourly_rate_rub, query.duration or plan.durations[0])
        if query.max_rate is not None and h.price > query.max_rate:
            continue
        today = plan.today(now)
        scanned_until = today + timedelta(days=WHEN_WINDOW_DAYS)
        known = plan.starts(query.duration, today, scanned_until, now)
        if query.when and not when_matches(query.when, known, tz, now):
            continue
        h.next_start = plan.next_start(query.duration, now, scanned_until, known)
        kept.append(h)

    far = now + timedelta(days=3650)
    if query.sort == "soon":
        kept.sort(key=lambda h: (h.next_start or far, -h.score))
    elif query.sort == "price":
        kept.sort(key=lambda h: (h.price, h.next_start or far))
    elif query.sort == "experience":
        kept.sort(key=lambda h: (-(h.profile.experience_years or 0), h.next_start or far))
    elif words or topics:
        kept.sort(key=lambda h: (-h.score, h.next_start or far))
    # иначе — порядок каталога (по числу проведённых созвонов)
    return kept


# ── Частые запросы и варианты фильтров ────────────────────────────

# Запросы, с которыми чаще всего приходят (если специалисты с ними работают — показываем первыми)
CURATED = ("Тревога", "Выгорание", "Отношения", "Самооценка", "Депрессия", "Панические атаки", "Одиночество", "Сон")


def facets(profiles) -> dict:
    """Частые запросы и значения фильтров по одобренным специалистам (без данных клиентов)."""
    from collections import Counter

    from apps.availability import services
    from apps.availability.engine import DURATION_OPTIONS

    from apps.availability.models import AvailabilitySettings

    profiles = list(profiles)
    prefetched = {s.profile_id: s for s in AvailabilitySettings.objects.filter(profile_id__in=[p.id for p in profiles])}
    topic_weight: Counter = Counter()
    label: dict[str, str] = {}
    languages: Counter = Counter()
    approaches: Counter = Counter()
    durations: set[int] = set()
    rates: list[int] = []
    genders: Counter = Counter()
    for p in profiles:
        sessions = getattr(p, "completed_sessions_count", 0) or 0
        for s in p.specializations or []:
            key = fold(s)
            label.setdefault(key, str(s))
            topic_weight[key] += 1 + min(sessions, 50) / 10  # спрос: сколько специалистов и созвонов
        for lang in p.languages or []:
            languages[str(lang)] += 1
        for key in approach_keys(p.approach):
            approaches[key] += 1
        if p.gender:
            genders[p.gender] += 1
        st = prefetched.get(p.id) or services.get_settings(p)
        durations.update(services.allowed_durations(st))
        rates.append(int(p.session_rate_rub or 0))

    curated = [fold(c) for c in CURATED if fold(c) in topic_weight]
    rest = [k for k, _ in topic_weight.most_common() if k not in curated]
    popular = (curated + rest)[:8]
    return {
        "popular": [{"label": label[k], "count": _count_with(profiles, k)} for k in popular],
        "topics": sorted(({"label": label[k], "count": _count_with(profiles, k)} for k in topic_weight),
                         key=lambda x: x["label"]),
        "approaches": [{"value": k, "label": APPROACHES[k][0], "count": approaches[k]}
                       for k in APPROACHES if approaches[k]],
        "languages": [{"label": k, "count": v} for k, v in languages.most_common()],
        "durations": sorted(d for d in durations if d in DURATION_OPTIONS),
        "genders": [{"value": g, "count": genders[g]} for g in GENDERS if genders[g]],
        "price": {"min": min(rates, default=0), "max": max(rates, default=0)},
        "when": [{"value": k, "label": v} for k, v in WHEN.items()],
    }


def _count_with(profiles, key: str) -> int:
    return sum(1 for p in profiles if any(fold(s) == key for s in p.specializations or []))
