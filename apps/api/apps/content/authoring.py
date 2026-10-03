"""
Статьи специалистов и их модерация.

Специалист (/pro/articles) пишет статью: Markdown, тема, описание, источники (по желанию), обложка.
Статусы (Article.moderation): черновик → на модерации → опубликована / отклонена (с комментарием).
Публикует только сотрудник с правом content.publish (/admin/content, очередь «От специалистов»).

    /api/v1/content/my/articles/                    GET, POST            — мои статьи
    /api/v1/content/my/articles/<id>/               GET, PATCH, DELETE   — черновик/отклонённую можно править
    /api/v1/content/my/articles/<id>/submit/        POST                 — отправить на модерацию
    /api/v1/content/my/articles/<id>/withdraw/      POST                 — вернуть в черновики (и снять с публикации)
    /api/v1/content/covers/                         POST (multipart)     — загрузить обложку (сотрудник или специалист)
    /api/v1/content/images/                         POST (multipart)     — картинка в текст статьи (они же)
    /api/v1/content/articles/<slug>/rating/         GET, PUT {stars}, DELETE — оценка 1–5 (PUT/DELETE — вошедшие)
    /api/v1/content/manage/articles/<id>/moderate/  POST {decision, comment}  — content.publish
    /api/v1/content/manage/articles/<id>/editors-choice/  POST {editors_choice} — content.publish («Выбор редакции»)
    /api/v1/content/articles/<slug>/read/           POST                 — +1 прочтение (анонимно)
"""
import json
import re
import uuid

from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework import generics, serializers, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, BasePermission
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from rest_framework.views import APIView

from apps.users.permissions import IsPsychologist

from .covers import CoverError, process_cover, process_image
from .models import Article, ArticleCover, ArticleImage, ArticleRating, Moderation
from .permissions import can_manage_content
from .richtext import word_count
from .serializers import ArticleManageSerializer, ArticleWriteMixin, CoverImageMixin, _topic_label, clean_sources

M = Moderation

_TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh", "з": "z", "и": "i",
    "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t",
    "у": "u", "ф": "f", "х": "h", "ц": "c", "ч": "ch", "ш": "sh", "щ": "shch", "ъ": "", "ы": "y", "ь": "",
    "э": "e", "ю": "yu", "я": "ya",
}


def unique_slug(title: str) -> str:
    base = "".join(_TRANSLIT.get(ch, ch) for ch in (title or "").lower())
    base = re.sub(r"[^a-z0-9]+", "-", base).strip("-")[:80].strip("-") or "statya"
    slug = base
    while Article.objects.filter(slug=slug).exists():
        slug = f"{base}-{uuid.uuid4().hex[:5]}"
    return slug


def estimate_minutes(content: str) -> int:
    return max(1, min(90, round(word_count(content) / 160)))


def can_publish(user) -> bool:
    if not (user and user.is_authenticated):
        return False
    try:
        from apps.staff.roles import has_staff_perm
    except ImportError:  # pragma: no cover
        return can_manage_content(user)
    return has_staff_perm(user, "content.publish")


class CanPublishContent(BasePermission):
    message = "Публиковать материалы могут только сотрудники с правом на публикацию."

    def has_permission(self, request, view):
        return can_publish(request.user)


def _audit(request, action, article, details=None):
    try:
        from apps.staff.audit import audit
    except ImportError:  # pragma: no cover
        return
    audit(request, action, target=("article", article.pk, article.title), details=details or {})


# ── Обложки ─────────────────────────────────────────────────────────────────

class CoverThrottle(UserRateThrottle):
    rate = "40/hour"
    scope = "article_cover"


class CanUploadCover(BasePermission):
    message = "Загружать обложки могут редакция и специалисты."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        return can_manage_content(user) or hasattr(user, "psychologist_profile")


class CoverUploadView(APIView):
    """multipart: image, crop? ({"x","y","w"} — доли исходника). → {id, url, md, sm, width, height}"""

    permission_classes = [CanUploadCover]
    parser_classes = [MultiPartParser, FormParser]
    throttle_classes = [CoverThrottle]

    def post(self, request):
        crop = request.data.get("crop")
        if crop:
            try:
                crop = json.loads(crop) if isinstance(crop, str) else crop
                if not isinstance(crop, dict):
                    raise ValueError
            except ValueError:
                return Response({"detail": "Неверные параметры кадрирования."}, status=400)
        try:
            files = process_cover(request.FILES.get("image"), crop or None)
        except CoverError as exc:
            return Response({"detail": str(exc)}, status=400)
        cover = ArticleCover(uploaded_by=request.user, width=files["width"], height=files["height"])
        for field in ("image", "image_md", "image_sm"):
            getattr(cover, field).save(files[field].name, files[field], save=False)
        cover.save()
        return Response(cover.as_json(), status=status.HTTP_201_CREATED)


class ImageThrottle(UserRateThrottle):
    rate = "120/hour"
    scope = "article_image"


class ImageUploadView(APIView):
    """multipart: image → {id, url, md, width, height}. Вставляется в текст как <figure><img src=url>."""

    permission_classes = [CanUploadCover]
    parser_classes = [MultiPartParser, FormParser]
    throttle_classes = [ImageThrottle]

    def post(self, request):
        try:
            files = process_image(request.FILES.get("image"))
        except CoverError as exc:
            return Response({"detail": str(exc)}, status=400)
        img = ArticleImage(uploaded_by=request.user, width=files["width"], height=files["height"])
        for field in ("image", "image_md"):
            getattr(img, field).save(files[field].name, files[field], save=False)
        img.save()
        return Response(img.as_json(), status=status.HTTP_201_CREATED)


# ── Кабинет специалиста ─────────────────────────────────────────────────────

class MyArticleSerializer(ArticleWriteMixin, CoverImageMixin, serializers.ModelSerializer):
    own_covers_only = True
    topic_label = serializers.SerializerMethodField()
    topic_labels = serializers.SerializerMethodField()
    cover_image = serializers.SerializerMethodField()
    status = serializers.CharField(source="moderation", read_only=True)

    class Meta:
        model = Article
        fields = (
            "id", "slug", "title", "summary", "content", "body", "topic", "topic_label", "topics", "topic_labels",
            "sources", "cover", "cover_image",
            "cover_image_id", "reading_minutes", "status", "moderation_comment", "submitted_at", "moderated_at",
            "published_at", "is_published", "editors_choice", "reads", "created_at", "updated_at", "language",
        )
        read_only_fields = (
            "slug", "reading_minutes", "moderation_comment", "submitted_at", "moderated_at", "published_at",
            "is_published", "editors_choice", "reads", "created_at", "updated_at", "cover",
        )
        extra_kwargs = {"title": {"max_length": 200}, "body": {"required": False, "allow_blank": True, "write_only": True}}

    def get_topic_label(self, obj):
        return _topic_label(obj.topic)

    def get_topic_labels(self, obj):
        return [_topic_label(t) for t in (obj.topics or [obj.topic])]

    def get_cover_image(self, obj):
        return obj.cover_image.as_json() if obj.cover_image_id and obj.cover_image else None

    def validate_title(self, value):
        value = " ".join((value or "").split())
        if len(value) < 3:
            raise serializers.ValidationError("Заголовок — хотя бы несколько слов.")
        return value

    def validate_body(self, value):
        if len(value or "") > 60_000:
            raise serializers.ValidationError("Текст слишком длинный: до 60 000 знаков.")
        return value

    def validate_sources(self, value):
        return clean_sources(value)

    def validate(self, attrs):
        if self.instance is not None and self.instance.moderation not in (M.DRAFT, M.REJECTED):
            raise serializers.ValidationError(
                {"detail": "Статья на модерации или опубликована. Верните её в черновики, чтобы изменить."})
        attrs = self.normalize_text_and_topics(attrs)
        if len(attrs.get("content") or "") > 200_000 or word_count(attrs.get("content") or "") > 12_000:
            raise serializers.ValidationError({"content": ["Текст слишком длинный: до 12 000 слов."]})
        return attrs

    def create(self, validated_data):
        profile = self.context["request"].user.psychologist_profile
        validated_data.update(
            specialist=profile, author_name=profile.display_name, moderation=M.DRAFT, is_published=False,
            slug=unique_slug(validated_data.get("title", "")),
            reading_minutes=estimate_minutes(validated_data.get("content", "")),
        )
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if "content" in validated_data:
            validated_data["reading_minutes"] = estimate_minutes(validated_data["content"])
        return super().update(instance, validated_data)


def _my_articles(request):
    return Article.objects.filter(specialist__user=request.user).select_related("cover_image")


class MyArticleListView(generics.ListCreateAPIView):
    permission_classes = [IsPsychologist]
    serializer_class = MyArticleSerializer

    def get_queryset(self):
        return _my_articles(self.request).order_by("-updated_at")


class MyArticleDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsPsychologist]
    serializer_class = MyArticleSerializer
    http_method_names = ["get", "patch", "delete"]

    def get_queryset(self):
        return _my_articles(self.request)

    def perform_destroy(self, instance):
        cover = instance.cover_image
        instance.delete()
        if cover is not None and not Article.objects.filter(cover_image=cover).exists():
            cover.delete_files()
            cover.delete()


MIN_WORDS = 150


class MyArticleSubmitView(APIView):
    permission_classes = [IsPsychologist]

    def post(self, request, pk):
        article = _my_articles(request).filter(pk=pk).first()
        if article is None:
            return Response({"detail": "Статья не найдена."}, status=404)
        profile = request.user.psychologist_profile
        if profile.verification_status != profile.VerificationStatus.APPROVED:
            return Response({"detail": "Отправлять статьи можно после проверки профиля."}, status=403)
        if article.moderation not in (M.DRAFT, M.REJECTED):
            return Response({"detail": "Статья уже на модерации или опубликована."}, status=400)
        errors = {}
        if len(article.title.strip()) < 3:
            errors["title"] = ["Добавьте заголовок."]
        if len(article.summary.strip()) < 20:
            errors["summary"] = ["Добавьте короткое описание: 1–2 предложения."]
        if word_count(article.content) < MIN_WORDS:
            errors["content"] = [f"Текст слишком короткий: нужно хотя бы {MIN_WORDS} слов."]
        if errors:
            return Response(errors, status=400)
        article.moderation = M.PENDING
        article.submitted_at = timezone.now()
        article.author_name = profile.display_name
        article.save(update_fields=["moderation", "submitted_at", "author_name", "updated_at"])
        return Response(MyArticleSerializer(article, context={"request": request}).data)


class MyArticleWithdrawView(APIView):
    """На модерации → черновик; опубликованная → снимается с публикации и становится черновиком."""

    permission_classes = [IsPsychologist]

    def post(self, request, pk):
        article = _my_articles(request).filter(pk=pk).first()
        if article is None:
            return Response({"detail": "Статья не найдена."}, status=404)
        if article.moderation not in (M.PENDING, M.APPROVED):
            return Response({"detail": "Статья и так в черновиках."}, status=400)
        article.moderation = M.DRAFT
        article.is_published = False
        article.editors_choice = False
        article.save(update_fields=["moderation", "is_published", "editors_choice", "updated_at"])
        return Response(MyArticleSerializer(article, context={"request": request}).data)


# ── Модерация (сотрудники) ─────────────────────────────────────────────────

class ModerateSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["approve", "reject"])
    comment = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")

    def validate(self, attrs):
        if attrs["decision"] == "reject" and not attrs["comment"].strip():
            raise serializers.ValidationError({"comment": ["Напишите автору, что поправить."]})
        return attrs


class ModerateArticleView(APIView):
    permission_classes = [CanPublishContent]

    def post(self, request, pk):
        ser = ModerateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        with transaction.atomic():
            article = (Article.objects.select_for_update().filter(pk=pk, specialist__isnull=False)
                       .exclude(moderation=M.DRAFT).first())
            if article is None:
                return Response({"detail": "Статья не найдена."}, status=404)
            if article.moderation != M.PENDING:
                return Response({"detail": "Решение по статье уже принято."}, status=400)
            decision, comment = ser.validated_data["decision"], ser.validated_data["comment"].strip()
            now = timezone.now()
            article.moderation = M.APPROVED if decision == "approve" else M.REJECTED
            article.moderation_comment = comment
            article.moderated_at = now
            article.moderated_by = request.user
            article.is_published = decision == "approve"
            if decision == "approve":
                article.published_at = article.published_at or now
            article.save()
        _audit(request, f"content.article.{decision}", article,
               {"slug": article.slug, "specialist": article.specialist_id})
        return Response(ArticleManageSerializer(article, context={"request": request}).data)


class EditorsChoiceView(APIView):
    """«Выбор редакции» — значок на карточке и буст в ранжировании (место в ленте решает ranking.py)."""

    permission_classes = [CanPublishContent]

    def post(self, request, pk):
        article = Article.objects.filter(pk=pk).first()
        if article is None:
            return Response({"detail": "Статья не найдена."}, status=404)
        value = request.data.get("editors_choice", request.data.get("featured"))
        on = value is True or str(value).lower() in ("1", "true")
        if on and not article.is_published:
            return Response({"detail": "Отметить можно только опубликованную статью."}, status=400)
        if on and article.specialist_id is None:
            return Response({"detail": "«Выбор редакции» — только для статей специалистов."}, status=400)
        if article.editors_choice != on:
            article.editors_choice = on
            article.save(update_fields=["editors_choice", "updated_at"])
            _audit(request, "content.article.editors_choice" if on else "content.article.editors_choice_off", article,
                   {"slug": article.slug})
        return Response(ArticleManageSerializer(article, context={"request": request}).data)


# ── Прочтения ──────────────────────────────────────────────────────────────

class ReadThrottle(AnonRateThrottle):
    rate = "120/hour"
    scope = "article_read"


class ArticleReadView(APIView):
    """+1 прочтение. Без cookie и без привязки к пользователю: только счётчик."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ReadThrottle]

    def post(self, request, slug):
        n = Article.objects.filter(slug=slug, is_published=True).update(reads=F("reads") + 1)
        return Response(status=204 if n else 404)


# ── Оценки ─────────────────────────────────────────────────────────────────

class RatingThrottle(UserRateThrottle):
    rate = "60/hour"
    scope = "article_rating"


def _rating_summary(article, user=None):
    from django.db.models import Avg, Count

    agg = ArticleRating.objects.filter(article=article).aggregate(avg=Avg("stars"), count=Count("id"))
    data = {"avg": round(float(agg["avg"]), 1) if agg["count"] else None, "count": agg["count"]}
    if user is not None and user.is_authenticated:
        mine = ArticleRating.objects.filter(article=article, user=user).values_list("stars", flat=True).first()
        data.update(mine=mine, can_rate=_can_rate(user, article))
    else:
        data.update(mine=None, can_rate=False)
    return data


def _can_rate(user, article) -> bool:
    """Клиенты и специалисты с аккаунтом; автор свою статью не оценивает."""
    if not (user and user.is_authenticated) or user.role not in ("client", "psychologist"):
        return False
    return not (article.specialist_id and article.specialist.user_id == user.pk)


class ArticleRatingView(APIView):
    """GET — {avg, count, mine, can_rate}; PUT {stars: 1–5} — поставить/изменить; DELETE — убрать свою.
    Наружу — только среднее и количество: кто как оценил, не видно ни автору, ни сотрудникам."""

    permission_classes = [AllowAny]

    def get_throttles(self):
        return [RatingThrottle()] if self.request.method in ("PUT", "DELETE") else []

    def _article(self, slug):
        from .views import public_articles

        return public_articles().filter(slug=slug).first()

    def get(self, request, slug):
        article = self._article(slug)
        if article is None:
            return Response({"detail": "Статья не найдена."}, status=404)
        return Response(_rating_summary(article, request.user))

    def put(self, request, slug):
        if not request.user.is_authenticated:
            return Response({"detail": "Войдите, чтобы оценить статью."}, status=401)
        article = self._article(slug)
        if article is None:
            return Response({"detail": "Статья не найдена."}, status=404)
        if not _can_rate(request.user, article):
            return Response({"detail": "Эту статью вы оценить не можете."}, status=403)
        try:
            stars = int(request.data.get("stars"))
        except (TypeError, ValueError):
            stars = 0
        if not 1 <= stars <= 5:
            return Response({"stars": ["Оценка — от 1 до 5."]}, status=400)
        ArticleRating.objects.update_or_create(article=article, user=request.user, defaults={"stars": stars})
        return Response(_rating_summary(article, request.user))

    def delete(self, request, slug):
        if not request.user.is_authenticated:
            return Response({"detail": "Войдите, чтобы оценить статью."}, status=401)
        article = self._article(slug)
        if article is None:
            return Response({"detail": "Статья не найдена."}, status=404)
        ArticleRating.objects.filter(article=article, user=request.user).delete()
        return Response(_rating_summary(article, request.user))
