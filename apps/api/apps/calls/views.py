from django.shortcuts import get_object_or_404
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from apps.sessions.models import ConsultationSession
from apps.sessions.views import participant_role

from .models import CallFeedback

TECH_KEYS = {
    "rttMs", "lossIn", "lossOut", "sendKbps", "recvKbps", "capKbps", "codec", "recvFps", "recvSize",
    "sendFps", "limitation", "relay", "status", "backend", "detectFps", "detectMs", "latencyMs",
    "browser", "voice", "durationSec", "reconnects",
}


class FeedbackIn(serializers.Serializer):
    kind = serializers.ChoiceField(choices=["rating", "problem"])
    rating = serializers.IntegerField(min_value=1, max_value=5, required=False, allow_null=True)
    issues = serializers.ListField(child=serializers.ChoiceField(choices=CallFeedback.ISSUES), required=False, max_length=10)
    comment = serializers.CharField(required=False, allow_blank=True, max_length=1000)
    tech = serializers.DictField(required=False)

    def validate(self, data):
        if data["kind"] == "rating" and not data.get("rating"):
            raise serializers.ValidationError({"rating": "Поставьте оценку от 1 до 5."})
        if data["kind"] == "problem" and not data.get("issues") and not (data.get("comment") or "").strip():
            raise serializers.ValidationError({"issues": "Выберите, что пошло не так, или опишите проблему."})
        return data


class FeedbackThrottle(UserRateThrottle):
    rate = "30/hour"


class CallFeedbackView(APIView):
    """POST /api/v1/calls/{session_id}/feedback/ — rate a call or report a problem (participants only)."""

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [FeedbackThrottle]

    def post(self, request, session_id):
        session = get_object_or_404(ConsultationSession, id=session_id)
        role = participant_role(session, request.user)
        if role is None:
            return Response({"detail": "Это не ваш звонок."}, status=status.HTTP_403_FORBIDDEN)
        s = FeedbackIn(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        tech = {k: v for k, v in (d.get("tech") or {}).items() if k in TECH_KEYS and isinstance(v, (int, float, str, bool, type(None)))}
        tech = {k: (v[:120] if isinstance(v, str) else v) for k, v in tech.items()}
        if d["kind"] == "rating":
            fb, _ = CallFeedback.objects.update_or_create(
                session=session, author=request.user, kind="rating",
                defaults={"role": role, "rating": d["rating"], "issues": d.get("issues", []), "comment": d.get("comment", ""), "tech": tech},
            )
        else:
            fb = CallFeedback.objects.create(
                session=session, author=request.user, role=role, kind="problem",
                issues=d.get("issues", []), comment=d.get("comment", ""), tech=tech,
            )
        return Response({"id": fb.id, "kind": fb.kind, "rating": fb.rating}, status=status.HTTP_201_CREATED)


class CallPresenceView(APIView):
    """GET /api/v1/calls/{session_id}/presence/ — is the other side already in the call room?

    Reads the signaling slot (set while their WebSocket is connected). Only a
    boolean leaves the server; used by the lobby («Специалист уже в комнате»).
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, session_id):
        from django.core.cache import cache

        from apps.signaling.consumers import _slot_key

        session = get_object_or_404(ConsultationSession, id=session_id)
        role = participant_role(session, request.user)
        if role is None:
            return Response({"detail": "Это не ваш звонок."}, status=status.HTTP_403_FORBIDDEN)
        other = "psychologist" if role == "client" else "client"
        return Response({"peer_in_room": bool(cache.get(_slot_key(str(session.webrtc_room_id), other)))})
