import datetime
import hashlib
import json

from django.utils import timezone

from .seed_articles import ARTICLES, REVIEWED_AT
from .seed_history import ARTICLE_FINGERPRINTS, PRACTICE_FINGERPRINTS
from .seed_practices import PRACTICES


def reading_minutes(text: str) -> int:
    """Honest estimate: ~160 words per minute for calm, attentive reading."""
    return max(2, round(len(text.split()) / 160))


def _fp(parts) -> str:
    return hashlib.sha256(json.dumps(parts, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]


def fingerprint_article(title, summary, body) -> str:
    return _fp([title, summary, body])


def fingerprint_practice(title, summary, steps) -> str:
    return _fp([title, summary, steps])


def _fields(model) -> set[str]:
    return {f.name for f in model._meta.get_fields()}


def _only_known(model, data: dict) -> dict:
    """Historical (migration) models may not have the newer fields yet."""
    known = _fields(model)
    return {k: v for k, v in data.items() if k in known}


def _article_defaults(data):
    d = {**data, "is_published": True, "reading_minutes": reading_minutes(data["body"])}
    d.setdefault("reviewed_at", REVIEWED_AT)
    if isinstance(d.get("reviewed_at"), str):
        d["reviewed_at"] = datetime.date.fromisoformat(d["reviewed_at"])
    d.pop("slug")
    return d


def _practice_defaults(data):
    d = {**data, "is_published": True}
    d.setdefault("reviewed_at", REVIEWED_AT)
    if isinstance(d.get("reviewed_at"), str):
        d["reviewed_at"] = datetime.date.fromisoformat(d["reviewed_at"])
    d.pop("slug")
    return d


def seed_content(Article, Practice, *, overwrite=False, upgrade=False) -> tuple[int, int]:
    """Create starter articles/practices by slug.

    Existing rows are left alone (staff edits made in the CMS win), except:
    - `overwrite`: reset every seeded item to the current starter text;
    - `upgrade`: replace a seeded item only if it is untouched, i.e. its title/summary/body
      (steps for practices) still match a known earlier starter version or the current one.

    Works with both real and historical (migration) models. Returns (articles, practices)
    created-or-updated counts."""
    now = timezone.now()
    n_a = n_p = 0
    for i, data in enumerate(ARTICLES):
        defaults = _only_known(Article, _article_defaults(data))
        obj = Article.objects.filter(slug=data["slug"]).first()
        if obj is None:
            # Stagger dates so the list has a stable, meaningful order
            Article.objects.create(slug=data["slug"], published_at=now - timezone.timedelta(days=i), **defaults)
            n_a += 1
            continue
        untouched = False
        if upgrade:
            known = set(ARTICLE_FINGERPRINTS.get(data["slug"], ()))
            known.add(fingerprint_article(data["title"], data["summary"], data["body"]))
            untouched = fingerprint_article(obj.title, obj.summary, obj.body) in known
        if overwrite or untouched:
            for k, v in defaults.items():
                setattr(obj, k, v)
            obj.save()
            n_a += 1
    for data in PRACTICES:
        defaults = _only_known(Practice, _practice_defaults(data))
        obj = Practice.objects.filter(slug=data["slug"]).first()
        if obj is None:
            Practice.objects.create(slug=data["slug"], **defaults)
            n_p += 1
            continue
        untouched = False
        if upgrade:
            known = set(PRACTICE_FINGERPRINTS.get(data["slug"], ()))
            known.add(fingerprint_practice(data["title"], data["summary"], data["steps"]))
            untouched = fingerprint_practice(obj.title, obj.summary, obj.steps) in known
        if overwrite or untouched:
            for k, v in defaults.items():
                setattr(obj, k, v)
            obj.save()
            n_p += 1
    return n_a, n_p
