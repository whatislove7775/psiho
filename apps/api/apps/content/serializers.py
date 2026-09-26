from rest_framework import serializers

from urllib.parse import urlparse

from .models import Article, Practice, Topic

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


class ArticleListSerializer(serializers.ModelSerializer):
    topic_label = serializers.SerializerMethodField()

    class Meta:
        model = Article
        fields = (
            "id", "slug", "title", "summary", "topic", "topic_label", "tags", "cover", "emoji",
            "reading_minutes", "author_name", "published_at", "updated_at", "evidence_level",
        )

    def get_topic_label(self, obj):
        return _topic_label(obj.topic)


class ArticleDetailSerializer(ArticleListSerializer):
    class Meta(ArticleListSerializer.Meta):
        fields = ArticleListSerializer.Meta.fields + ("body", "key_facts", "when_to_seek_help", "sources", "reviewed_at")


class ArticleManageSerializer(ArticleListSerializer):
    class Meta(ArticleListSerializer.Meta):
        fields = ArticleListSerializer.Meta.fields + (
            "body", "key_facts", "when_to_seek_help", "sources", "reviewed_at", "is_published", "created_at",
        )
        read_only_fields = ("created_at", "updated_at")
        extra_kwargs = {"published_at": {"required": False, "allow_null": True}}

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
        attrs = super().validate(attrs)
        if "key_facts" in attrs:
            sources = attrs.get("sources", getattr(self.instance, "sources", None) or [])
            attrs["key_facts"] = clean_key_facts(attrs["key_facts"], len(sources))
        return attrs

    def validate_reading_minutes(self, value):
        if not 1 <= value <= 90:
            raise serializers.ValidationError("От 1 до 90 минут.")
        return value


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
