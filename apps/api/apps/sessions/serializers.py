from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from apps.photos.utils import photo_url

from .models import ConsultationSession

JOIN_EARLY = timedelta(minutes=10)
JOIN_LATE = timedelta(minutes=15)
JOINABLE_STATUSES = (ConsultationSession.Status.PAID, ConsultationSession.Status.IN_PROGRESS)


def can_join(session: ConsultationSession, now=None) -> bool:
    now = now or timezone.now()
    if session.status not in JOINABLE_STATUSES:
        return False
    start = session.scheduled_at
    end = start + timedelta(minutes=session.duration_minutes)
    return start - JOIN_EARLY <= now <= end + JOIN_LATE


class SessionSerializer(serializers.ModelSerializer):
    amount_rub = serializers.SerializerMethodField()
    room_id = serializers.UUIDField(source="webrtc_room_id", read_only=True)
    can_join = serializers.SerializerMethodField()
    psychologist = serializers.SerializerMethodField()
    client = serializers.SerializerMethodField()
    payment_url = serializers.SerializerMethodField()
    dialogue_id = serializers.SerializerMethodField()
    # Диалог пары = чат (chat.Conversation): id совпадают; conversation_id — для встроенного чата звонка
    conversation_id = serializers.SerializerMethodField()

    class Meta:
        model = ConsultationSession
        fields = [
            "id", "status", "scheduled_at", "duration_minutes", "amount_rub", "room_id",
            "can_join", "psychologist", "client", "payment_url", "dialogue_id", "conversation_id",
        ]
        read_only_fields = fields

    def get_amount_rub(self, obj):
        return obj.amount_kopecks // 100

    def get_can_join(self, obj):
        return can_join(obj)

    def get_psychologist(self, obj):
        profile = obj.psychologist_profile
        return {
            "id": profile.id,
            "display_name": profile.display_name,
            "avatar_config": profile.user.avatar_config,
            "photo_url": photo_url(profile),
        }

    def get_client(self, obj):
        return {"alias": obj.client.alias, "avatar_config": obj.client.avatar_config}

    def get_dialogue_id(self, obj):
        """Диалог пары, внутри которого живёт созвон (ссылка «назад к диалогу» из /room/[id])."""
        from apps.dialogs.services import dialogue_id_for

        return dialogue_id_for(obj)

    def get_conversation_id(self, obj):
        from apps.dialogs.services import ensure_dialogue

        # Участник созвона всегда получает чат пары (создаётся при необходимости)
        return str(ensure_dialogue(obj.client, obj.psychologist_profile).id)

    def get_payment_url(self, obj):
        if obj.status != ConsultationSession.Status.AWAITING_PAYMENT:
            return None
        # RelatedObjectDoesNotExist — подкласс AttributeError
        payment = getattr(obj, "payment", None)
        if payment is not None:
            return payment.confirmation_url or None  # старый платёж ЮKassa «на сессию»
        return f"/app/balance/pay/{obj.pk}"  # оплата с баланса (apps.billing, PayForCall)


class BookSessionSerializer(serializers.Serializer):
    psychologist_id = serializers.IntegerField()
    scheduled_at = serializers.DateTimeField()
    # Допустимые значения задаёт специалист (apps.availability); по умолчанию — самая короткая
    duration_minutes = serializers.IntegerField(min_value=10, max_value=240, required=False)
