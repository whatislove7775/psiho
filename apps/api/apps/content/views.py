from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Article, Practice, Topic
from .permissions import IsContentStaff
from .serializers import (
    ArticleDetailSerializer,
    ArticleListSerializer,
    ArticleManageSerializer,
    PracticeDetailSerializer,
    PracticeListSerializer,
    PracticeManageSerializer,
)


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
        used = set(Article.objects.filter(is_published=True).values_list("topic", flat=True))
        return Response([
            {"value": t.value, "label": t.label, "count": Article.objects.filter(is_published=True, topic=t.value).count()}
            for t in Topic if t.value in used
        ])


# ── Public read API ────────────────────────────────────────────────────────

class ArticleListView(generics.ListAPIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = ArticleListSerializer

    def get_queryset(self):
        qs = Article.objects.filter(is_published=True)
        topic = self.request.query_params.get("topic")
        if topic:
            qs = qs.filter(topic=topic)
        tag = self.request.query_params.get("tag")
        if tag:
            # JSON contains lookup isn't available on SQLite, filter in Python
            ids = [a.id for a in qs if tag in (a.tags or [])]
            qs = qs.filter(id__in=ids)
        exclude = self.request.query_params.get("exclude")
        if exclude:
            qs = qs.exclude(slug=exclude)
        limit = _limit(self.request)
        return qs[:limit] if limit else qs


class ArticleDetailView(generics.RetrieveAPIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = ArticleDetailSerializer
    lookup_field = "slug"
    queryset = Article.objects.filter(is_published=True)


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

class ManageArticleListView(generics.ListCreateAPIView):
    permission_classes = [IsContentStaff]
    serializer_class = ArticleManageSerializer

    def get_queryset(self):
        return Article.objects.order_by("-updated_at")


class ManageArticleDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsContentStaff]
    serializer_class = ArticleManageSerializer
    queryset = Article.objects.all()


class ManagePracticeListView(generics.ListCreateAPIView):
    permission_classes = [IsContentStaff]
    serializer_class = PracticeManageSerializer

    def get_queryset(self):
        return Practice.objects.order_by("order", "id")


class ManagePracticeDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsContentStaff]
    serializer_class = PracticeManageSerializer
    queryset = Practice.objects.all()
