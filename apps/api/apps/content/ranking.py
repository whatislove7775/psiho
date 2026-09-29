"""Ранжирование статей для лент («Топ» и порядок по умолчанию). Формула описана в docs/API.md.

    score = (1 + ln(1 + reads)) × (0.5 + R/5) × F × B

    R — байесовское среднее оценок: (C·m + Σ звёзд) / (C + n), C = 5, m — средняя оценка по сайту
        (4.0, пока оценок нет). Одна «пятёрка» почти не сдвигает статью, много хороших — сдвигают.
    F — свежесть: 0.15 + 0.85 · 0.5^(возраст в днях / 30) — полураспад 30 дней, но «вечные» статьи
        не падают до нуля.
    B — бусты: ×1.3 статья специалиста, ×1.5 «Выбор редакции».

Каталог небольшой — считаем в Python по уже отфильтрованному queryset (с аннотациями rating_avg/rating_count).
"""
import math

from django.db.models import Avg

PRIOR_WEIGHT = 5  # C: сколько «виртуальных» оценок по средней добавляем к каждой статье
DEFAULT_MEAN = 4.0
HALF_LIFE_DAYS = 30
FRESHNESS_FLOOR = 0.15
SPECIALIST_BOOST = 1.3
EDITORS_CHOICE_BOOST = 1.5


def site_mean() -> float:
    from .models import ArticleRating

    mean = ArticleRating.objects.aggregate(m=Avg("stars"))["m"]
    return float(mean) if mean else DEFAULT_MEAN


def bayes_rating(avg, count, mean: float) -> float:
    n = int(count or 0)
    total = float(avg or 0) * n
    return (PRIOR_WEIGHT * mean + total) / (PRIOR_WEIGHT + n)


def score(article, now, mean: float) -> float:
    reads = max(0, int(getattr(article, "reads", 0) or 0))
    rating = bayes_rating(getattr(article, "rating_avg", None), getattr(article, "rating_count", 0), mean)
    age_days = max(0.0, (now - (article.published_at or article.created_at)).total_seconds() / 86400)
    freshness = FRESHNESS_FLOOR + (1 - FRESHNESS_FLOOR) * 0.5 ** (age_days / HALF_LIFE_DAYS)
    boost = (SPECIALIST_BOOST if article.specialist_id else 1.0) * (EDITORS_CHOICE_BOOST if article.editors_choice else 1.0)
    return (1 + math.log1p(reads)) * (0.5 + rating / 5) * freshness * boost


def ranked(qs, now):
    """Статьи по убыванию score; при равенстве — более свежие выше."""
    mean = site_mean()
    items = list(qs)
    items.sort(key=lambda a: (score(a, now, mean), a.published_at or a.created_at), reverse=True)
    return items
