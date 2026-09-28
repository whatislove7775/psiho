from django.db.models import Avg, Count
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Article, Moderation, Practice, Topic
from .permissions import IsContentStaff
from .serializers import (
    ArticleDetailSerializer,
    ArticleListSerializer,
    ArticleManageSerializer,
    PracticeDetailSerializer,
    PracticeListSerializer,
    PracticeManageSerializer,
)


def public_articles():
    """Опубликованные статьи. Статьи специалистов — только пока профиль автора подтверждён."""
    from apps.users.models import PsychologistProfile

    return (
        Article.objects.filter(is_published=True)
        .exclude(specialist__isnull=False, moderation__in=[Moderation.DRAFT, Moderation.PENDING, Moderation.REJECTED])
        .exclude(specialist__isnull=False,
                 specialist__verification_status__in=[s for s in PsychologistProfile.VerificationStatus.values
                                                      if s != PsychologistProfile.VerificationStatus.APPROVED])
        .select_related("cover_image", "specialist", "specialist__photo")
        .annotate(rating_avg=Avg("ratings__stars"), rating_count=Count("ratings"))
    )


def topic_filter(qs, value: str):
    """?topic=a или ?topic=a,b — статьи, у которых среди тем есть любая из указанных.
    JSON-поиск по списку на SQLite недоступен, каталог небольшой — фильтруем в Python."""
    wanted = {t for t in (value or "").split(",") if t}
    if not wanted:
        return qs
    ids = [pk for pk, topics, topic in qs.values_list("id", "topics", "topic")
           if wanted & set(topics or [topic])]
    return qs.filter(id__in=ids)


def _top_score(a, now) -> float:
    """«В топе»: прочтения с поправкой на свежесть (старые статьи постепенно опускаются)."""
    age_days = max(0.0, (now - (a.published_at or a.created_at)).total_seconds() / 86400)
    return (a.reads + 5) / ((age_days + 2) ** 1.2)


def _limit(request, default=None):
    try:
        n = int(request.query_params.get("limit", ""))
    except ValueError:
        return default
    return max(1, min(n, 100))


class TopicListView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        counts: dict[str, int] = {}
        for topics, topic in Article.objects.filter(id__in=public_articles().values("id")).values_list("topics", "topic"):
            for t in set(topics or [topic]):
                counts[t] = counts.get(t, 0) + 1
        return Response([
            {"value": t.value, "label": t.label, "count": counts[t.value]}
            for t in Topic if counts.get(t.value)
        ])


# ── Public read API ────────────────────────────────────────────────────────

class ArticleListView(generics.ListAPIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = ArticleListSerializer

    def get_queryset(self):
        qs = public_articles()
        source = self.request.query_params.get("source")
        if source == "specialists":
            qs = qs.filter(specialist__isnull=False)
        elif source == "editorial":
            qs = qs.filter(specialist__isnull=True)
        qs = topic_filter(qs, self.request.query_params.get("topic", "")[:200])
        tag = self.request.query_params.get("tag")
        if tag:
            # JSON contains lookup isn't available on SQLite, filter in Python
            ids = [a.id for a in qs if tag in (a.tags or [])]
            qs = qs.filter(id__in=ids)
        exclude = self.request.query_params.get("exclude")
        if exclude:
            qs = qs.exclude(slug=exclude)
        q = (self.request.query_params.get("q") or "").strip().casefold()[:100]
        if q:
            # Python-side match: SQLite's LIKE doesn't case-fold Cyrillic; the catalogue is small
            words = q.split()
            ids = [
                a.id for a in qs.select_related(None).only("id", "title", "summary", "tags")
                if all(w in f"{a.title} {a.summary} {' '.join(a.tags or [])}".casefold() for w in words)
            ]
            qs = qs.filter(id__in=ids)
        limit = _limit(self.request)
        if self.request.query_params.get("sort") == "top":
            # Закреплённые сотрудником — первыми, дальше по прочтениям и свежести
            now = timezone.now()
            items = sorted(qs, key=lambda a: (not a.is_featured, -_top_score(a, now)))
            return items[:limit] if limit else items
        # Закреплённые «В топе» — первыми, остальные по дате публикации
        qs = qs.order_by("-is_featured", "-published_at", "-created_at")
        return qs[:limit] if limit else qs


class ArticleDetailView(generics.RetrieveAPIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = ArticleDetailSerializer
    lookup_field = "slug"

    def get_queryset(self):
        return public_articles()


class PracticeListView(generics.ListAPIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = PracticeListSerializer

    def get_queryset(self):
        qs = Practice.objects.filter(is_published=True)
        kind = self.request.query_params.get("kind")
        if kind:
            qs = qs.filter(kind=kind)
        limit = _limit(self.request)
        return qs[:limit] if limit else qs


class PracticeDetailView(generics.RetrieveAPIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = PracticeDetailSerializer
    lookup_field = "slug"
    queryset = Practice.objects.filter(is_published=True)


# ── Staff CMS API ──────────────────────────────────────────────────────────

def _staff_articles():
    # Черновики специалистов сотрудникам не видны, пока автор не отправит статью на модерацию
    return (Article.objects.exclude(specialist__isnull=False, moderation=Moderation.DRAFT)
            .select_related("cover_image", "specialist", "specialist__photo")
            .annotate(rating_avg=Avg("ratings__stars"), rating_count=Count("ratings")))


class ManageArticleListView(generics.ListCreateAPIView):
    """?source=specialists — очередь «От специалистов» (сначала ждущие решения), editorial — только редакция."""

    permission_classes = [IsContentStaff]
    serializer_class = ArticleManageSerializer

    def get_queryset(self):
        qs = _staff_articles()
        source = self.request.query_params.get("source")
        if source == "specialists":
            from django.db.models import Case, IntegerField, Value, When

            pending_first = Case(When(moderation=Moderation.PENDING, then=Value(0)), default=Value(1),
                                 output_field=IntegerField())
            return qs.filter(specialist__isnull=False).order_by(pending_first, "submitted_at", "-updated_at")
        if source == "editorial":
            qs = qs.filter(specialist__isnull=True)
        return qs.order_by("-updated_at")


class ManageArticleDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsContentStaff]
    serializer_class = ArticleManageSerializer

    def get_queryset(self):
        return _staff_articles()


class ManagePracticeListView(generics.ListCreateAPIView):
    permission_classes = [IsContentStaff]
    serializer_class = PracticeManageSerializer

    def get_queryset(self):
        return Practice.objects.order_by("order", "id")


class ManagePracticeDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsContentStaff]
    serializer_class = PracticeManageSerializer
    queryset = Practice.objects.all()
