from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

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

    class Meta:
        model = ConsultationSession
        fields = [
            "id", "status", "scheduled_at", "duration_minutes", "amount_rub", "room_id",
            "can_join", "psychologist", "client", "payment_url",
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
        }

    def get_client(self, obj):
        return {"alias": obj.client.alias, "avatar_config": obj.client.avatar_config}

    def get_payment_url(self, obj):
        if obj.status != ConsultationSession.Status.AWAITING_PAYMENT:
            return None
        # RelatedObjectDoesNotExist — подкласс AttributeError
        payment = getattr(obj, "payment", None)
        return (payment.confirmation_url or None) if payment else None


class BookSessionSerializer(serializers.Serializer):
    psychologist_id = serializers.IntegerField()
    scheduled_at = serializers.DateTimeField()
    duration_minutes = serializers.ChoiceField(choices=[50, 80], default=50)
