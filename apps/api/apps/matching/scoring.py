"""
Подбор специалиста по короткой анкете — прозрачная взвешенная оценка.

Ответы анкеты живут только в запросе: ничего не сохраняется в базе и не пишется
в логи (это чувствительные данные о состоянии человека).

Из 100 баллов:
* темы (35) — с чем приходит человек против тем специалиста (а слабее — его «о себе» и подхода);
* стиль работы (20) — «поддержка / техники / глубина» против подхода специалиста;
* бюджет (15) — цена часа против выбранного потолка;
* удобное время (15) — есть ли свободные окна утром/днём/вечером/в выходные в ближайшие 2 недели;
* опыт (10) — стаж против пожелания (а если трудно давно или сильно — чем больше опыта, тем лучше);
* отзывы (5) — средняя оценка опубликованных отзывов, если они есть.
Пол специалиста — жёсткое пожелание: кто не подходит по полу, идёт после всех, кто подходит.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

WEIGHTS = {"topics": 35, "style": 20, "budget": 15, "time": 15, "experience": 10, "rating": 5}

# key → (подпись, «работает с …» в творительном падеже, начала слов для поиска в темах специалиста)
TOPICS: dict[str, tuple[str, str, tuple[str, ...]]] = {
    "anxiety": ("Тревога", "тревогой", ("трево", "беспокой", "страх")),
    "burnout": ("Выгорание", "выгоранием", ("выгора", "стресс", "переутом")),
    "relationships": ("Отношения", "отношениями", ("отношен", "расстав", "развод", "пар")),
    "self_esteem": ("Самооценка", "самооценкой", ("самооцен", "уверенн", "самоприн")),
    "grief": ("Горе и утрата", "горем и утратой", ("горе", "утрат", "потер")),
    "depression": ("Апатия и депрессия", "депрессией", ("депресс", "апат")),
    "panic": ("Панические атаки", "паническими атаками", ("паническ", "паник")),
    "sleep": ("Сон", "нарушениями сна", ("сон", "сна", "бессон")),
    "anger": ("Гнев и раздражение", "гневом", ("гнев", "агресс", "злост", "раздраж")),
    "addiction": ("Зависимости", "зависимостями", ("завис",)),
    "crisis": ("Кризис, перемены", "кризисами", ("кризис", "перемен")),
    "family": ("Семья и дети", "семейными вопросами", ("семь", "дет", "подрост", "родител")),
    "loneliness": ("Одиночество", "одиночеством", ("одиноч",)),
}

DURATIONS = {"weeks": "Несколько недель", "months": "Несколько месяцев", "year": "Больше года"}
INTENSITY = {"mild": "Немного мешает", "notable": "Заметно мешает жить", "heavy": "Очень тяжело"}
SAFETY = {"no": "Нет", "sometimes": "Иногда бывают", "now": "Да, сейчас"}

# Стиль → ключи подходов из apps.users.search.APPROACHES и слова, по которым узнаём стиль в тексте
STYLES: dict[str, tuple[str, str, set[str], tuple[str, ...]]] = {
    "support": ("Поддержка и разговор", "вы хотите поддержки и разговора",
                {"eft", "gestalt", "existential"},
                ("клиент-центр", "клиентцентр", "гуманист", "поддерж", "бережн", "принят")),
    "techniques": ("Конкретные техники и задания", "вы выбрали конкретные техники",
                   {"cbt", "act", "ba", "mi", "emdr"},
                   ("техник", "упражнен", "домашн", "навык", "план")),
    "depth": ("Глубокая работа с причинами", "вы хотите разобраться в причинах",
              {"psychodynamic", "gestalt", "existential", "schema", "eft", "systemic"},
              ("причин", "глубин", "детств", "психоанал")),
}

GENDERS = {"female": ("Женщина", "женщина, как вы хотели"), "male": ("Мужчина", "мужчина, как вы хотели")}
EXPERIENCE = {0: "Неважно", 3: "От 3 лет", 5: "От 5 лет", 10: "От 10 лет"}
BUDGETS = (2000, 3000, 4000, 5000)

# Время суток по часовому поясу клиента
TIMES = {"morning": ("Утро", "утром", 6, 12), "day": ("День", "днём", 12, 18),
         "evening": ("Вечер", "вечером", 18, 24), "weekend": ("Выходные", "в выходные", 0, 24)}
TIME_WINDOW_DAYS = 14
HEAVY_EXPERIENCE = 7  # «трудно давно или очень тяжело» — ищем опыт от 7 лет


@dataclass
class Answers:
    topics: list[str] = field(default_factory=list)
    duration: str = ""
    intensity: str = ""
    safety: str = "no"
    style: str = ""
    gender: str = ""
    min_experience: int = 0
    budget: int | None = None
    times: list[str] = field(default_factory=list)
    tz: ZoneInfo | None = None

    @property
    def heavy(self) -> bool:
        return self.intensity == "heavy" or (self.duration == "year" and self.intensity == "notable")


@dataclass
class Reason:
    key: str
    ok: bool
    text: str
    points: int
    max: int

    def as_dict(self) -> dict:
        return {"key": self.key, "ok": self.ok, "text": self.text, "points": self.points, "max": self.max}


@dataclass
class Match:
    profile: object
    score: int
    fits: bool
    reasons: list[Reason]
    summary: str
    next_start: datetime | None = None
    price_hour: int = 0


def fold(text) -> str:
    return str(text or "").casefold().replace("ё", "е")


def _words(text: str) -> list[str]:
    return re.findall(r"[\w\-]+", fold(text))


def _has_start(words: list[str], needles) -> bool:
    return any(w.startswith(n) or any(part.startswith(n) for part in w.split("-")) for w in words for n in needles)


def _lower(label: str) -> str:
    """«Поведенческая активация» → «поведенческая активация»; аббревиатуры (КПТ, ACT, EMDR) не трогаем."""
    first = label.split()[0]
    return label if first.isupper() else label[:1].lower() + label[1:]


def join_ru(items: list[str]) -> str:
    items = [x for x in items if x]
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " и " + items[-1]


def rub(n: int) -> str:
    return f"{int(n):,}".replace(",", " ") + " ₽"


def years_label(n: int) -> str:
    a, b = n % 100, n % 10
    word = "лет" if 10 < a < 20 else "год" if b == 1 else "года" if 1 < b < 5 else "лет"
    return f"{n} {word}"


# ── Критерии ───────────────────────────────────────────────────────

def topics_reason(p, a: Answers) -> Reason:
    mx = WEIGHTS["topics"]
    if not a.topics:
        return Reason("topics", True, "", mx // 2, mx)
    spec_words = _words(" ".join(p.specializations or []))
    text_words = _words(f"{p.bio} {p.approach}")
    strong = [k for k in a.topics if _has_start(spec_words, TOPICS[k][2])]
    weak = [k for k in a.topics if k not in strong and _has_start(text_words, TOPICS[k][2])]
    need = min(len(a.topics), 3)
    frac = min(1.0, (len(strong) + 0.5 * len(weak)) / need)
    pts = round(mx * frac)
    if strong:
        text = "Работает с " + join_ru([TOPICS[k][1] for k in (strong + weak)[:3]])
        return Reason("topics", True, text, pts, mx)
    if weak:
        return Reason("topics", True, "В описании упоминает работу с " + join_ru([TOPICS[k][1] for k in weak[:2]]),
                      pts, mx)
    return Reason("topics", False, "Ваши темы не указаны среди основных", pts, mx)


def style_reason(p, a: Answers) -> Reason:
    from apps.users.search import APPROACHES, approach_keys

    mx = WEIGHTS["style"]
    if not a.style:
        return Reason("style", True, "", mx // 2, mx)
    label, why, keys, needles = STYLES[a.style]
    mine = approach_keys(p.approach)
    hits = [_lower(APPROACHES[k][0]) for k in APPROACHES if k in mine and k in keys]
    if hits:
        return Reason("style", True, f"использует {join_ru(hits[:2])} — {why}", mx, mx)
    if _has_start(_words(f"{p.approach} {p.bio}"), needles):
        return Reason("style", True, f"по описанию подходит: {why}", round(mx * 0.7), mx)
    if not mine and not (p.approach or "").strip():
        return Reason("style", False, "Подход не указан — уточните в диалоге", round(mx * 0.3), mx)
    other = [_lower(APPROACHES[k][0]) for k in APPROACHES if k in mine]
    text = f"Работает иначе ({join_ru(other[:2])})" if other else "Подход отличается от выбранного"
    return Reason("style", False, text, round(mx * 0.2), mx)


def budget_reason(price_hour: int, a: Answers, intro: dict | None) -> Reason:
    mx = WEIGHTS["budget"]
    tail = ""
    if intro and intro.get("enabled"):
        tail = "; знакомство 15 минут бесплатно" if not intro.get("price_rub") else \
            f"; знакомство 15 минут за {rub(intro['price_rub'])}"
    if a.budget is None:
        return Reason("budget", True, f"{rub(price_hour)} за час{tail}", mx, mx)
    if price_hour <= a.budget:
        return Reason("budget", True, f"в вашем бюджете: {rub(price_hour)} за час{tail}", mx, mx)
    if price_hour <= a.budget * 1.15:
        return Reason("budget", False, f"чуть выше бюджета: {rub(price_hour)} за час{tail}", round(mx * 0.5), mx)
    return Reason("budget", False, f"дороже вашего бюджета: {rub(price_hour)} за час{tail}", 0, mx)


def _in_bucket(local: datetime, key: str) -> bool:
    if key == "weekend":
        return local.weekday() >= 5
    _, _, h0, h1 = TIMES[key]
    return h0 <= local.hour < h1


def time_reason(starts: list[datetime], a: Answers, now: datetime) -> Reason:
    mx = WEIGHTS["time"]
    tz = a.tz or ZoneInfo("Europe/Moscow")
    week_end = now + timedelta(days=7)
    local = [(s, s.astimezone(tz)) for s in starts]
    if not local:
        return Reason("time", False, "В ближайшие две недели свободного времени нет", 0, mx)
    if not a.times:
        if any(s <= week_end for s, _ in local):
            return Reason("time", True, "есть свободное время на этой неделе", mx, mx)
        return Reason("time", True, "есть свободное время на следующей неделе", round(mx * 0.8), mx)
    wanted = [k for k in TIMES if k in a.times]
    hit_week = [k for k in wanted if any(s <= week_end and _in_bucket(l, k) for s, l in local)]
    if hit_week:
        return Reason("time", True, f"есть окна {join_ru([TIMES[k][1] for k in hit_week])} на этой неделе", mx, mx)
    hit_later = [k for k in wanted if any(_in_bucket(l, k) for _, l in local)]
    if hit_later:
        return Reason("time", True, f"есть окна {join_ru([TIMES[k][1] for k in hit_later])} на следующей неделе",
                      round(mx * 0.7), mx)
    return Reason("time", False, "Свободно в другое время — можно спросить в диалоге", round(mx * 0.25), mx)


def experience_reason(p, a: Answers) -> Reason:
    mx = WEIGHTS["experience"]
    years = int(p.experience_years or 0)
    target = a.min_experience or (HEAVY_EXPERIENCE if a.heavy else 0)
    if not target:
        pts = mx if years >= 3 else round(mx * 0.7)
        return Reason("experience", True, f"опыт {years_label(years)}" if years else "", pts, mx)
    if years >= target:
        return Reason("experience", True, f"опыт {years_label(years)}", mx, mx)
    return Reason("experience", False, f"опыт {years_label(years)} — меньше, чем вы хотели" if a.min_experience
                  else f"опыт {years_label(years)}", round(mx * 0.6 * years / target), mx)


def rating_reason(p) -> Reason:
    from apps.reviews.services import rating_of

    mx = WEIGHTS["rating"]
    avg, total = rating_of(p)
    if avg is None or not total:
        return Reason("rating", True, "", 3, mx)
    text = f"оценка {str(avg).replace('.', ',')} по отзывам ({total})"
    if avg >= 4.5:
        return Reason("rating", True, text, mx, mx)
    if avg >= 4.0:
        return Reason("rating", True, text, 4, mx)
    return Reason("rating", False, text, 2, mx)


def gender_ok(p, a: Answers) -> tuple[bool, str]:
    if not a.gender:
        return True, ""
    if p.gender == a.gender:
        return True, GENDERS[a.gender][1]
    return False, "Пол специалиста не совпадает с вашим пожеланием"


def summarize(reasons: list[Reason], gender_text: str) -> str:
    """«Работает с тревогой и выгоранием, использует КПТ — вы выбрали конкретные техники; есть окна вечером…»"""
    by = {r.key: r for r in reasons}
    head = []
    if by["topics"].ok and by["topics"].text:
        head.append(by["topics"].text)
    if by["style"].ok and by["style"].text:
        head.append(by["style"].text)
    parts = [", ".join(head)] if head else []
    if by["time"].ok and by["time"].text:
        parts.append(by["time"].text)
    if by["budget"].ok and by["budget"].text.startswith("в вашем бюджете"):
        parts.append("в вашем бюджете")
    if gender_text:
        parts.append(gender_text)
    out = "; ".join(p for p in parts if p)
    return (out[:1].upper() + out[1:]) if out else ""


def score_profile(p, plan, a: Answers, now: datetime) -> Match:
    from apps.availability.services import intro_info

    today = plan.today(now)
    starts = plan.starts(None, today, today + timedelta(days=TIME_WINDOW_DAYS), now)
    price_hour = int(plan.settings.hourly_rate_rub)
    intro = intro_info(p) if plan.settings.intro_enabled else None
    reasons = [
        topics_reason(p, a),
        style_reason(p, a),
        budget_reason(price_hour, a, intro),
        time_reason(starts, a, now),
        experience_reason(p, a),
        rating_reason(p),
    ]
    fits, gender_text = gender_ok(p, a)
    if not fits:
        reasons.append(Reason("gender", False, gender_text, 0, 0))
    score = max(0, min(100, sum(r.points for r in reasons)))
    return Match(
        profile=p, score=score, fits=fits, reasons=reasons,
        summary=summarize(reasons, gender_text if fits else ""),
        next_start=starts[0] if starts else plan.next_start(None, now),
        price_hour=price_hour,
    )


def rank(profiles, a: Answers, now: datetime) -> list[Match]:
    from apps.availability import bulk

    profiles = list(profiles)
    plans = bulk.load_plans(profiles, now)
    far = now + timedelta(days=3650)
    matches = [score_profile(p, plans[p.id], a, now) for p in profiles]
    matches.sort(key=lambda m: (not m.fits, -m.score, m.next_start or far, m.profile.id))
    return matches


def crisis_level(a: Answers) -> str:
    return {"sometimes": "some", "now": "acute"}.get(a.safety, "none")


CRISIS_HELP = [
    {"label": "Экстренные службы", "phone": "112", "note": "Если есть непосредственная опасность — звоните сейчас"},
    {"label": "Телефон доверия для взрослых", "phone": "8-800-333-44-34", "note": "Бесплатно, круглосуточно"},
    {"label": "Детский телефон доверия", "phone": "8-800-2000-122", "note": "Для подростков и родителей, бесплатно"},
]


def options() -> dict:
    return {
        "topics": [{"value": k, "label": v[0]} for k, v in TOPICS.items()],
        "durations": [{"value": k, "label": v} for k, v in DURATIONS.items()],
        "intensity": [{"value": k, "label": v} for k, v in INTENSITY.items()],
        "safety": [{"value": k, "label": v} for k, v in SAFETY.items()],
        "styles": [{"value": k, "label": v[0]} for k, v in STYLES.items()],
        "genders": [{"value": k, "label": v[0]} for k, v in GENDERS.items()],
        "experience": [{"value": k, "label": v} for k, v in EXPERIENCE.items()],
        "budgets": list(BUDGETS),
        "times": [{"value": k, "label": v[0]} for k, v in TIMES.items()],
        "weights": WEIGHTS,
        "crisis_help": CRISIS_HELP,
    }
