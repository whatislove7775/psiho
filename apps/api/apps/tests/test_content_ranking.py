"""Ранжирование статей (apps/content/ranking.py): свежесть, прочтения, байесовская оценка, бусты."""
from datetime import timedelta
from types import SimpleNamespace

from django.utils import timezone

from apps.content import ranking

NOW = timezone.now()


def _a(days=1, reads=0, avg=None, count=0, specialist=False, editors=False):
    return SimpleNamespace(
        reads=reads, rating_avg=avg, rating_count=count, published_at=NOW - timedelta(days=days), created_at=NOW,
        specialist_id=7 if specialist else None, editors_choice=editors,
    )


def s(a):
    return ranking.score(a, NOW, 4.0)


def test_recency_decays_but_has_floor():
    assert s(_a(days=1)) > s(_a(days=30)) > s(_a(days=365)) > 0
    assert s(_a(days=3650)) >= s(_a(days=1)) * ranking.FRESHNESS_FLOOR * 0.9


def test_reads_raise_score():
    assert s(_a(reads=1000)) > s(_a(reads=10)) > s(_a(reads=0))


def test_bayesian_rating_needs_many_votes():
    one_five = ranking.bayes_rating(5, 1, 4.0)
    many_five = ranking.bayes_rating(5, 50, 4.0)
    many_low = ranking.bayes_rating(2, 50, 4.0)
    assert 4.0 < one_five < many_five and many_low < 4.0
    assert s(_a(avg=5, count=50)) > s(_a(avg=5, count=1)) > s(_a(avg=2, count=50))


def test_specialist_and_editors_choice_boosts():
    base = s(_a())
    assert s(_a(specialist=True)) == base * ranking.SPECIALIST_BOOST
    assert s(_a(editors=True)) == base * ranking.EDITORS_CHOICE_BOOST
    assert s(_a(specialist=True, editors=True)) > s(_a(editors=True))
