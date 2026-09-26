from datetime import time

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import PsychologistProfile, PsychologistSchedule, User, validate_avatar_config

MAX_TAGS = 20
MAX_TAG_LEN = 60


def _clean_tags(value):
    cleaned = []
    for item in value:
        item = str(item).strip()
        if item and item not in cleaned:
            cleaned.append(item[:MAX_TAG_LEN])
    if len(cleaned) > MAX_TAGS:
        raise serializers.ValidationError(f"Не больше {MAX_TAGS} элементов.")
    return cleaned


class AvatarConfigField(serializers.JSONField):
    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        try:
            validate_avatar_config(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages)
        return value


# ── Психологи ─────────────────────────────────────────────────────

class PsychologistPublicSerializer(serializers.ModelSerializer):
    session_rate_rub = serializers.IntegerField(min_value=0, max_value=1_000_000)
    avatar_config = serializers.SerializerMethodField()
    photo_url = serializers.SerializerMethodField()
    sessions_count = serializers.SerializerMethodField()
    next_slot = serializers.SerializerMethodField()
    booking = serializers.SerializerMethodField()
    specializations = serializers.ListField(child=serializers.CharField(), required=False)
    languages = serializers.ListField(child=serializers.CharField(), required=False)
    experience_years = serializers.IntegerField(min_value=0, max_value=80, required=False)

    class Meta:
        model = PsychologistProfile
        fields = [
            "id", "display_name", "bio", "approach", "specializations", "languages",
            "experience_years", "session_rate_rub", "avatar_config", "photo_url", "sessions_count",
            "next_slot", "booking", "gender", "rating", "reviews_count", "verified_credentials",
        ]
        read_only_fields = ["id"]

    # G2: средняя оценка по опубликованным отзывам и число подтверждённых документов
    rating = serializers.SerializerMethodField()
    reviews_count = serializers.SerializerMethodField()
    verified_credentials = serializers.SerializerMethodField()

    def get_rating(self, obj):
        from apps.reviews.services import rating_of

        return rating_of(obj)[0]

    def get_reviews_count(self, obj):
        from apps.reviews.services import rating_of

        return rating_of(obj)[1]

    def get_verified_credentials(self, obj):
        from apps.credentials.services import verified_count

        return verified_count(obj)

    def validate_specializations(self, value):
        return _clean_tags(value)

    def validate_languages(self, value):
        return _clean_tags(value)

    def get_avatar_config(self, obj):
        return obj.user.avatar_config

    def get_photo_url(self, obj):
        from apps.photos.utils import photo_url

        return photo_url(obj)

    def get_sessions_count(self, obj):
        annotated = getattr(obj, "completed_sessions_count", None)
        if annotated is not None:
            return annotated
        from apps.sessions.models import ConsultationSession
        return obj.psychologist_sessions.filter(
            status=ConsultationSession.Status.COMPLETED
        ).count()

    def get_next_slot(self, obj):
        from apps.sessions.scheduling import next_slot

        # Списки считают ближайшее время пакетно (apps.users.search) и передают сюда
        known = self.context.get("next_starts") if hasattr(self, "context") else None
        if known is not None and obj.id in known:
            slot = known[obj.id]
        else:
            slot = next_slot(obj)
        return serializers.DateTimeField().to_representation(slot) if slot else None

    def get_booking(self, obj):
        """Длительности и цены (apps.availability). session_rate_rub = цена самой короткой сессии."""
        from apps.availability.services import booking_info

        # H1: «знакомство уже было» — только для самого клиента (по его запросу)
        request = self.context.get("request") if hasattr(self, "context") else None
        user = getattr(request, "user", None)
        return booking_info(obj, user if getattr(user, "role", "") == "client" else None)


class PsychologistPrivateSerializer(PsychologistPublicSerializer):
    class Meta(PsychologistPublicSerializer.Meta):
        fields = PsychologistPublicSerializer.Meta.fields + ["verification_status"]
        read_only_fields = ["id", "verification_status"]


class PsychologistAdminSerializer(PsychologistPrivateSerializer):
    class Meta(PsychologistPrivateSerializer.Meta):
        fields = PsychologistPrivateSerializer.Meta.fields + ["created_at"]
        read_only_fields = fields


# ── Пользователь ─────────────────────────────────────────────────

class UserSerializer(serializers.ModelSerializer):
    has_email = serializers.BooleanField(read_only=True)
    created_at = serializers.DateTimeField(source="date_joined", read_only=True)
    avatar_config = AvatarConfigField(allow_null=True, required=False)
    psychologist = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "alias", "role", "avatar_config", "has_email", "created_at", "psychologist"]
        read_only_fields = ["id", "alias", "role", "has_email", "created_at", "psychologist"]

    def get_psychologist(self, obj):
        if obj.role != User.Role.PSYCHOLOGIST:
            return None
        profile = getattr(obj, "psychologist_profile", None)
        if profile is None:
            return None
        return PsychologistPrivateSerializer(profile, context=self.context).data


class AnonymousSignupSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True, min_length=8, max_length=128)


class PsychologistRegisterSerializer(serializers.Serializer):
    email = serializers.EmailField(write_only=True)
    password = serializers.CharField(write_only=True, min_length=8, max_length=128)
    display_name = serializers.CharField(max_length=80)
    bio = serializers.CharField(max_length=1200, required=False, allow_blank=True, default="")
    specializations = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    session_rate_rub = serializers.IntegerField(min_value=0, max_value=1_000_000)
    experience_years = serializers.IntegerField(min_value=0, max_value=80, required=False, default=0)

    def validate_specializations(self, value):
        return _clean_tags(value)


class LoginSerializer(serializers.Serializer):
    login = serializers.CharField(max_length=254)
    password = serializers.CharField(max_length=128)


class RecoverSerializer(serializers.Serializer):
    alias = serializers.CharField(max_length=60)
    recovery_key = serializers.CharField(max_length=64)
    new_password = serializers.CharField(min_length=8, max_length=128)


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(max_length=128)
    new_password = serializers.CharField(min_length=8, max_length=128)


class DeleteAccountSerializer(serializers.Serializer):
    password = serializers.CharField(max_length=128)


# ── Расписание ───────────────────────────────────────────────────

class ScheduleRuleSerializer(serializers.ModelSerializer):
    weekday = serializers.IntegerField(min_value=0, max_value=6)
    start_time = serializers.TimeField(format="%H:%M", input_formats=["%H:%M", "%H:%M:%S"])
    end_time = serializers.TimeField(format="%H:%M", input_formats=["%H:%M", "%H:%M:%S"])

    class Meta:
        model = PsychologistSchedule
        fields = ["weekday", "start_time", "end_time"]

    def validate(self, attrs):
        if attrs["start_time"] >= attrs["end_time"]:
            raise serializers.ValidationError(
                {"end_time": ["Время окончания должно быть позже времени начала."]}
            )
        return attrs


def schedule_overlap_error(rules: list[dict]) -> str | None:
    """Правила одного дня не должны пересекаться. Возвращает текст ошибки или None."""
    by_day: dict[int, list[tuple[time, time]]] = {}
    for rule in rules:
        by_day.setdefault(rule["weekday"], []).append((rule["start_time"], rule["end_time"]))
    for windows in by_day.values():
        windows.sort()
        for (_, prev_end), (next_start, _) in zip(windows, windows[1:]):
            if next_start < prev_end:
                return "Интервалы расписания в один день не должны пересекаться."
    return None
