from django.utils import timezone

from .seed_articles import ARTICLES
from .seed_practices import PRACTICES


def reading_minutes(text: str) -> int:
    """Honest estimate: ~160 words per minute for calm, attentive reading."""
    return max(2, round(len(text.split()) / 160))


def seed_content(Article, Practice, *, overwrite=False) -> tuple[int, int]:
    """Create starter articles/practices by slug. Existing rows are left alone
    unless `overwrite` (staff edits made in the CMS win by default).

    Works with both real and historical (migration) models."""
    now = timezone.now()
    created_a = created_p = 0
    for i, data in enumerate(ARTICLES):
        defaults = {**data, "is_published": True, "reading_minutes": reading_minutes(data["body"])}
        defaults.pop("slug")
        obj = Article.objects.filter(slug=data["slug"]).first()
        if obj is None:
            # Stagger dates so the list has a stable, meaningful order
            Article.objects.create(slug=data["slug"], published_at=now - timezone.timedelta(days=i), **defaults)
            created_a += 1
        elif overwrite:
            for k, v in defaults.items():
                setattr(obj, k, v)
            obj.save()
    for data in PRACTICES:
        defaults = {**data, "is_published": True}
        defaults.pop("slug")
        obj = Practice.objects.filter(slug=data["slug"]).first()
        if obj is None:
            Practice.objects.create(slug=data["slug"], **defaults)
            created_p += 1
        elif overwrite:
            for k, v in defaults.items():
                setattr(obj, k, v)
            obj.save()
    return created_a, created_p
