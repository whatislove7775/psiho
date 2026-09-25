from rest_framework import serializers

from .models import Article, Practice, Topic

COVERS = ("peach", "butter", "lime", "mint", "lilac", "sky")


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
            "reading_minutes", "author_name", "published_at",
        )

    def get_topic_label(self, obj):
        return _topic_label(obj.topic)


class ArticleDetailSerializer(ArticleListSerializer):
    class Meta(ArticleListSerializer.Meta):
        fields = ArticleListSerializer.Meta.fields + ("body",)


class ArticleManageSerializer(ArticleListSerializer):
    class Meta(ArticleListSerializer.Meta):
        fields = ArticleListSerializer.Meta.fields + ("body", "is_published", "created_at", "updated_at")
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
        )


class PracticeDetailSerializer(PracticeListSerializer):
    class Meta(PracticeListSerializer.Meta):
        fields = PracticeListSerializer.Meta.fields + ("steps", "pattern")


class PracticeManageSerializer(PracticeDetailSerializer):
    class Meta(PracticeDetailSerializer.Meta):
        fields = PracticeDetailSerializer.Meta.fields + ("order", "is_published", "created_at", "updated_at")
        read_only_fields = ("created_at", "updated_at")

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
