from rest_framework import serializers

from urllib.parse import urlparse

from .models import MAX_TOPICS, Article, Practice, Topic
from .richtext import markdown_to_html, sanitize_html

COVERS = ("peach", "butter", "lime", "mint", "lilac", "sky")
SOURCE_KINDS = ("guideline", "review", "study", "org", "book", "other")


def clean_sources(value):
    """Sources list: [{"title", "authors"?, "year"?, "publisher"?, "url", "doi"?, "kind"?}].
    Only http(s) links; the editor must have opened every link before publishing."""
    if value in (None, ""):
        return []
    if not isinstance(value, list) or len(value) > 30:
        raise serializers.ValidationError("Источники — список, не больше 30.")
    out = []
    for i, src in enumerate(value, 1):
        if not isinstance(src, dict):
            raise serializers.ValidationError(f"Источник {i}: нужен объект.")
        title = str(src.get("title", "")).strip()[:400]
        url = str(src.get("url", "")).strip()[:600]
        if not title:
            raise serializers.ValidationError(f"Источник {i}: нужно название.")
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise serializers.ValidationError(f"Источник {i}: нужна ссылка, начинающаяся с https://")
        item = {"title": title, "url": url}
        for key, limit in (("authors", 400), ("publisher", 300), ("doi", 120)):
            v = str(src.get(key, "") or "").strip()[:limit]
            if v:
                item[key] = v
        year = src.get("year")
        if year not in (None, ""):
            try:
                year = int(year)
            except (TypeError, ValueError):
                raise serializers.ValidationError(f"Источник {i}: год — число.")
            if not 1800 <= year <= 2100:
                raise serializers.ValidationError(f"Источник {i}: проверьте год.")
            item["year"] = year
        kind = str(src.get("kind", "") or "")
        if kind:
            if kind not in SOURCE_KINDS:
                raise serializers.ValidationError(f"Источник {i}: неизвестный тип.")
            item["kind"] = kind
        out.append(item)
    return out


def clean_key_facts(value, n_sources: int):
    if value in (None, ""):
        return []
    if not isinstance(value, list) or len(value) > 12:
        raise serializers.ValidationError("Ключевые факты — список, не больше 12.")
    out = []
    for i, fact in enumerate(value, 1):
        if not isinstance(fact, dict) or not str(fact.get("text", "")).strip():
            raise serializers.ValidationError(f"Факт {i}: нужен текст.")
        refs = fact.get("refs") or []
        if not isinstance(refs, list):
            raise serializers.ValidationError(f"Факт {i}: ссылки — список номеров источников.")
        clean_refs = []
        for r in refs:
            try:
                r = int(r)
            except (TypeError, ValueError):
                raise serializers.ValidationError(f"Факт {i}: номер источника — число.")
            if not 1 <= r <= n_sources:
                raise serializers.ValidationError(f"Факт {i}: источника [{r}] нет в списке.")
            clean_refs.append(r)
        out.append({"text": str(fact["text"]).strip()[:600], "refs": sorted(set(clean_refs))})
    return out


def _topic_label(value):
    try:
        return Topic(value).label
    except ValueError:
        return value


def clean_topics(value):
    """1–3 темы из списка Topic, без повторов; первая — основная."""
    if not isinstance(value, list) or not value:
        raise serializers.ValidationError("Выберите хотя бы одну тему.")
    out = []
    for v in value:
        if v not in Topic.values:
            raise serializers.ValidationError(f"Неизвестная тема: {v}.")
        if v not in out:
            out.append(v)
    if len(out) > MAX_TOPICS:
        raise serializers.ValidationError(f"Не больше {MAX_TOPICS} тем.")
    return out


class ArticleWriteMixin(serializers.Serializer):
    """Запись текста и тем.

    - `content` — HTML из редактора; очищается по белому списку (richtext.sanitize_html).
      Старые клиенты могут прислать `body` в Markdown — тогда HTML получается из него.
    - `topics` — до трёх тем; `topic` (одна) по-прежнему принимается и становится списком из одной."""

    topics = serializers.ListField(child=serializers.CharField(max_length=32), required=False)

    def validate_topics(self, value):
        return clean_topics(value)

    def validate_content(self, value):
        if len(value or "") > 300_000:
            raise serializers.ValidationError("Текст слишком длинный.")
        return sanitize_html(value)

    def normalize_text_and_topics(self, attrs):
        if "content" not in attrs and attrs.get("body"):
            attrs["content"] = markdown_to_html(attrs["body"])
        if "topics" in attrs:
            attrs["topic"] = attrs["topics"][0]
        elif "topic" in attrs:
            attrs["topics"] = [attrs["topic"]]
        return attrs


class ArticleListSerializer(serializers.ModelSerializer):
    topic_label = serializers.SerializerMethodField()
    topic_labels = serializers.SerializerMethodField()
    cover_image = serializers.SerializerMethodField()
    specialist = serializers.SerializerMethodField()
    rating = serializers.SerializerMethodField()

    class Meta:
        model = Article
        fields = (
            "id", "slug", "title", "summary", "topic", "topic_label", "topics", "topic_labels", "tags", "cover",
            "emoji", "reading_minutes", "author_name", "published_at", "updated_at", "evidence_level",
            "cover_image", "specialist", "is_featured", "rating",
        )

    def get_topic_label(self, obj):
        return _topic_label(obj.topic)

    def get_topic_labels(self, obj):
        return [_topic_label(t) for t in (obj.topics or [obj.topic])]

    def get_rating(self, obj):
        """{avg, count} — только сводка, без того, кто и как оценил."""
        avg, count = getattr(obj, "rating_avg", None), getattr(obj, "rating_count", None)
        if count is None:
            from django.db.models import Avg, Count

            agg = obj.ratings.aggregate(avg=Avg("stars"), count=Count("id"))
            avg, count = agg["avg"], agg["count"]
        return {"avg": round(float(avg), 1) if count else None, "count": count or 0}

    def get_cover_image(self, obj):
        return obj.cover_image.as_json() if obj.cover_image_id and obj.cover_image else None

    def get_specialist(self, obj):
        # Карточка: только имя и фото — метка «От специалиста»
        return specialist_brief(obj.specialist) if obj.specialist_id else None


def specialist_brief(profile, full: bool = False):
    if profile is None:
        return None
    from apps.photos.utils import photo_url

    data = {"id": profile.pk, "name": profile.display_name, "photo_url": photo_url(profile)}
    if full:
        bio = " ".join((profile.bio or "").split())
        if len(bio) > 220:
            bio = bio[:220].rsplit(" ", 1)[0].rstrip(",.;:—-") + "…"
        data.update({
            "bio": bio,
            "specializations": list(profile.specializations or [])[:3],
            "experience_years": profile.experience_years,
        })
    return data


class ArticleDetailSerializer(ArticleListSerializer):
    class Meta(ArticleListSerializer.Meta):
        fields = ArticleListSerializer.Meta.fields + ("content", "key_facts", "when_to_seek_help", "sources", "reviewed_at")

    def get_specialist(self, obj):
        # Страница статьи: имя, фото, коротко о себе — и ссылка на профиль / «Начать диалог»
        return specialist_brief(obj.specialist, full=True) if obj.specialist_id else None


class CoverImageMixin(serializers.Serializer):
    """Запись `cover_image_id` (UUID загруженной обложки или null — убрать обложку).
    Специалист может прикрепить только свою загрузку; старая обложка удаляется с диска."""

    cover_image_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)

    def validate_cover_image_id(self, value):
        if value is None:
            return None
        from .models import ArticleCover

        cover = ArticleCover.objects.filter(pk=value).first()
        request = self.context.get("request")
        own_only = getattr(self, "own_covers_only", False)
        if cover is None or (own_only and cover.uploaded_by_id != getattr(request.user, "pk", None)):
            raise serializers.ValidationError("Обложка не найдена. Загрузите её ещё раз.")
        return cover

    def _apply_cover(self, validated_data):
        if "cover_image_id" not in validated_data:
            return None
        new = validated_data.pop("cover_image_id")
        old = self.instance.cover_image if self.instance is not None else None
        validated_data["cover_image"] = new
        return old if old is not None and (new is None or old.pk != new.pk) else None

    def create(self, validated_data):
        self._apply_cover(validated_data)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        old = self._apply_cover(validated_data)
        instance = super().update(instance, validated_data)
        if old is not None and not Article.objects.filter(cover_image=old).exists():
            old.delete_files()
            old.delete()
        return instance


class ArticleManageSerializer(ArticleWriteMixin, CoverImageMixin, ArticleListSerializer):
    specialist = serializers.SerializerMethodField()

    class Meta(ArticleListSerializer.Meta):
        fields = ArticleListSerializer.Meta.fields + (
            "content", "body", "key_facts", "when_to_seek_help", "sources", "reviewed_at", "is_published", "created_at",
            "cover_image_id", "moderation", "moderation_comment", "submitted_at", "moderated_at", "reads",
        )
        read_only_fields = (
            "created_at", "updated_at", "is_featured", "moderation", "moderation_comment",
            "submitted_at", "moderated_at", "reads",
        )
        extra_kwargs = {"published_at": {"required": False, "allow_null": True}}

    def get_specialist(self, obj):
        return specialist_brief(obj.specialist, full=True) if obj.specialist_id else None

    def to_representation(self, obj):
        data = super().to_representation(obj)
        data.pop("body", None)  # прежний Markdown — только для записи старыми клиентами
        return data

    def validate_cover(self, value):
        if value not in COVERS:
            raise serializers.ValidationError(f"Выберите один из цветов: {', '.join(COVERS)}.")
        return value

    def validate_tags(self, value):
        if not isinstance(value, list) or not all(isinstance(t, str) and 0 < len(t) <= 40 for t in value):
            raise serializers.ValidationError("Теги — список коротких строк.")
        return value[:12]

    def validate_sources(self, value):
        return clean_sources(value)

    def validate(self, attrs):
        attrs = self.normalize_text_and_topics(super().validate(attrs))
        if self.instance is None and not attrs.get("content"):
            raise serializers.ValidationError({"content": ["Добавьте текст статьи."]})
        if "key_facts" in attrs:
            sources = attrs.get("sources", getattr(self.instance, "sources", None) or [])
            attrs["key_facts"] = clean_key_facts(attrs["key_facts"], len(sources))
        return attrs

    def validate_reading_minutes(self, value):
        if not 1 <= value <= 90:
            raise serializers.ValidationError("От 1 до 90 минут.")
        return value

    def create(self, validated_data):
        # Редактор по умолчанию — сотрудник, который создаёт статью (его публичное имя, если оно есть).
        if not (validated_data.get("author_name") or "").strip():
            validated_data["author_name"] = _editor_name(self.context.get("request"))
        return super().create(validated_data)


def _editor_name(request) -> str:
    user = getattr(request, "user", None)
    profile = getattr(user, "psychologist_profile", None) if user is not None else None
    name = (getattr(profile, "display_name", "") or "").strip()
    return name or "Редакция Aprosop"


class PracticeListSerializer(serializers.ModelSerializer):
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        model = Practice
        fields = (
            "id", "slug", "title", "summary", "kind", "kind_label", "duration_minutes", "cover", "emoji",
            "evidence_level", "updated_at",
        )


class PracticeDetailSerializer(PracticeListSerializer):
    class Meta(PracticeListSerializer.Meta):
        fields = PracticeListSerializer.Meta.fields + (
            "steps", "pattern", "mechanism", "cautions", "sources", "reviewed_at",
        )


class PracticeManageSerializer(PracticeDetailSerializer):
    class Meta(PracticeDetailSerializer.Meta):
        fields = PracticeDetailSerializer.Meta.fields + ("order", "is_published", "created_at")
        read_only_fields = ("created_at", "updated_at")

    def validate_sources(self, value):
        return clean_sources(value)

    def validate_cover(self, value):
        if value not in COVERS:
            raise serializers.ValidationError(f"Выберите один из цветов: {', '.join(COVERS)}.")
        return value

    def validate_steps(self, value):
        if not isinstance(value, list) or len(value) > 40:
            raise serializers.ValidationError("Шаги — список, не больше 40.")
        clean = []
        for i, step in enumerate(value, 1):
            if not isinstance(step, dict) or not str(step.get("text", "")).strip():
                raise serializers.ValidationError(f"Шаг {i}: нужен текст.")
            item = {"title": str(step.get("title", ""))[:120], "text": str(step["text"])[:2000]}
            seconds = step.get("seconds")
            if seconds not in (None, ""):
                try:
                    seconds = int(seconds)
                except (TypeError, ValueError):
                    raise serializers.ValidationError(f"Шаг {i}: время — число секунд.")
                if not 0 < seconds <= 3600:
                    raise serializers.ValidationError(f"Шаг {i}: от 1 секунды до часа.")
                item["seconds"] = seconds
            clean.append(item)
        return clean

    def validate_pattern(self, value):
        if value in (None, {}):
            return None
        if not isinstance(value, dict):
            raise serializers.ValidationError("Ритм дыхания — объект.")
        out = {}
        for key in ("inhale", "hold", "exhale", "hold_after", "cycles"):
            v = value.get(key, 0)
            try:
                v = int(v)
            except (TypeError, ValueError):
                raise serializers.ValidationError(f"{key}: нужно число.")
            if not 0 <= v <= 60:
                raise serializers.ValidationError(f"{key}: от 0 до 60.")
            out[key] = v
        if not out["inhale"] or not out["exhale"]:
            raise serializers.ValidationError("Вдох и выдох должны быть больше нуля.")
        out["cycles"] = out["cycles"] or 4
        return out
