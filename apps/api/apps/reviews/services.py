from django.db.models import Avg, Count, IntegerField, OuterRef, Subquery, FloatField
from django.db.models.functions import Coalesce

from .models import TAGS, Review

R = Review.Status


def completed_calls(client, profile) -> int:
    """Созвоны, которые состоялись и были оплачены: COMPLETED и деньги не вернули."""
    from apps.sessions.models import ConsultationSession

    if client is None or not getattr(client, "is_authenticated", False):
        return 0
    return (
        ConsultationSession.objects.filter(
            client=client, psychologist_profile=profile, status=ConsultationSession.Status.COMPLETED,
        )
        .exclude(billing_hold__status__in=["released", "refunded"])
        .count()
    )


def calls_between(client_id, profile_id) -> int:
    from apps.sessions.models import ConsultationSession

    return (
        ConsultationSession.objects.filter(
            client_id=client_id, psychologist_profile_id=profile_id, status=ConsultationSession.Status.COMPLETED,
        )
        .exclude(billing_hold__status__in=["released", "refunded"])
        .count()
    )


def annotate_rating(qs):
    """Добавляет rating_avg / reviews_total к queryset'у PsychologistProfile (подзапросы, без JOIN-размножения)."""
    published = Review.objects.filter(psychologist=OuterRef("pk"), status=R.PUBLISHED).order_by().values("psychologist")
    return qs.annotate(
        rating_avg=Subquery(published.annotate(a=Avg("rating")).values("a")[:1], output_field=FloatField()),
        reviews_total=Coalesce(
            Subquery(published.annotate(n=Count("id")).values("n")[:1], output_field=IntegerField()), 0
        ),
    )


def rating_of(profile) -> tuple[float | None, int]:
    avg = getattr(profile, "rating_avg", "__missing__")
    total = getattr(profile, "reviews_total", None)
    if avg == "__missing__" or total is None:
        agg = Review.objects.filter(psychologist=profile, status=R.PUBLISHED).aggregate(a=Avg("rating"), n=Count("id"))
        avg, total = agg["a"], agg["n"]
    return (round(float(avg), 1) if avg is not None and total else None), int(total or 0)


def summary(profile) -> dict:
    qs = Review.objects.filter(psychologist=profile, status=R.PUBLISHED)
    dist = {str(i): 0 for i in range(1, 6)}
    for rating, n in qs.values_list("rating").annotate(n=Count("id")):
        dist[str(rating)] = n
    total = sum(dist.values())
    avg = (sum(int(k) * v for k, v in dist.items()) / total) if total else None
    tag_counts: dict[str, int] = {}
    for tags in qs.values_list("tags", flat=True):
        for t in tags or []:
            if t in TAGS:
                tag_counts[t] = tag_counts.get(t, 0) + 1
    top = sorted(tag_counts.items(), key=lambda kv: (-kv[1], kv[0]))[:5]
    return {
        "rating": round(avg, 1) if avg is not None else None,
        "count": total,
        "distribution": dist,
        "top_tags": [{"key": k, "label": TAGS[k], "count": n} for k, n in top],
    }


def tag_rows(keys) -> list[dict]:
    return [{"key": k, "label": TAGS[k]} for k in keys or [] if k in TAGS]


def _calls_label(n: int) -> str:
    n = max(1, n)
    if n % 10 == 1 and n % 100 != 11:
        word = "созвон"
    elif 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        word = "созвона"
    else:
        word = "созвонов"
    return f"Клиент, {n} {word}"


def review_public(r: Review, *, viewer=None, calls: int | None = None) -> dict:
    n = calls if calls is not None else calls_between(r.client_id, r.psychologist_id)
    return {
        "id": r.id,
        "rating": r.rating,
        "text": r.text,
        "tags": tag_rows(r.tags),
        # Автор скрыт: только число созвонов. Дата — с точностью до месяца, чтобы не сопоставить с созвоном
        "author_label": _calls_label(n),
        "calls_count": max(1, n),
        "month": r.created_at.strftime("%Y-%m"),
        "edited": bool(r.edited_at),
        "reply": {"text": r.reply_text, "month": r.reply_at.strftime("%Y-%m") if r.reply_at else None}
        if r.reply_text else None,
        "mine": bool(viewer is not None and getattr(viewer, "pk", None) == r.client_id),
    }


def review_own(r: Review) -> dict:
    """Для автора: статус и полная дата."""
    return {
        **review_public(r),
        "mine": True,
        "status": r.status,
        "hidden_reason": r.hidden_reason if r.status == R.HIDDEN else "",
        "created_at": r.created_at.isoformat(),
        "updated_at": r.updated_at.isoformat(),
    }
