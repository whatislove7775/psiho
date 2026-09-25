"""
Лаборатория персонала: тестовые звонки без записи и оплаты.

    GET  /api/v1/lab/rooms/              мои активные тестовые комнаты      (lab.use)
    POST /api/v1/lab/rooms/              создать комнату → две ссылки       (lab.use)
    POST /api/v1/lab/rooms/<id>/close/   закрыть комнату досрочно            (lab.use)
    POST /api/v1/lab/join/  {token}      войти по ссылке (без входа в аккаунт)

Вход по ссылке не требует аккаунта: ссылку открывают на телефоне, где сотрудник
не залогинен. Токен подписан, живёт ≤ 2 часов и открывает только тестовую комнату.
"""
import uuid
from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from apps.signaling.tokens import make_ws_token
from apps.staff.audit import audit
from apps.staff.permissions import StaffPerm
from apps.staff.throttles import StaffReadThrottle, StaffWriteThrottle

from .models import TestRoom
from .tokens import make_lab_token, read_lab_token

MAX_ACTIVE_ROOMS = 5
PEER_NAMES = {"client": "Тестовый клиент", "psychologist": "Тестовый специалист"}


class LabJoinThrottle(SimpleRateThrottle):
    scope = "lab_join"
    rate = "60/min"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


def room_payload(room: TestRoom) -> dict:
    return {
        "id": str(room.id),
        "label": room.label,
        "created_at": room.created_at.isoformat(),
        "expires_at": room.expires_at.isoformat(),
        "is_active": room.is_active,
        "has_client_avatar": bool(room.client_avatar),
        "tokens": {
            "client": make_lab_token(room.id, "client"),
            "psychologist": make_lab_token(room.id, "psychologist"),
        },
    }


class CreateRoomSerializer(serializers.Serializer):
    label = serializers.CharField(max_length=80, required=False, allow_blank=True, default="")
    client_avatar = serializers.JSONField(required=False, allow_null=True, default=None)

    def validate_client_avatar(self, value):
        if value is None:
            return None
        if not isinstance(value, dict):
            raise serializers.ValidationError("Ожидается объект настроек аватара.")
        import json

        if len(json.dumps(value)) > 8000:
            raise serializers.ValidationError("Настройки аватара слишком большие.")
        return value


class LabRoomsView(APIView):
    permission_classes = [StaffPerm("lab.use")]
    throttle_classes = [StaffReadThrottle, StaffWriteThrottle]

    def get(self, request):
        rooms = TestRoom.objects.active().filter(created_by=request.user)
        return Response({"results": [room_payload(r) for r in rooms], "ttl_minutes": 120})

    def post(self, request):
        ser = CreateRoomSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        now = timezone.now()
        # Уборка: давно истёкшие комнаты больше не нужны
        TestRoom.objects.filter(expires_at__lt=now - timedelta(days=1)).delete()
        # Не больше MAX_ACTIVE_ROOMS активных комнат на сотрудника: старые закрываем сами
        active = list(TestRoom.objects.active().filter(created_by=request.user).order_by("-created_at"))
        for old in active[MAX_ACTIVE_ROOMS - 1:]:
            old.closed_at = now
            old.save(update_fields=["closed_at"])
        room = TestRoom.objects.create(
            created_by=request.user,
            label=ser.validated_data["label"].strip(),
            client_avatar=ser.validated_data["client_avatar"],
        )
        audit(request, "lab.room.create", target=("test_room", room.id, room.label or "Тестовая комната"))
        return Response(room_payload(room), status=status.HTTP_201_CREATED)


class LabRoomCloseView(APIView):
    permission_classes = [StaffPerm("lab.use")]
    throttle_classes = [StaffWriteThrottle]

    def post(self, request, pk):
        room = TestRoom.objects.filter(pk=pk, created_by=request.user).first()
        if room is None:
            return Response({"detail": "Комната не найдена."}, status=status.HTTP_404_NOT_FOUND)
        if room.closed_at is None:
            room.closed_at = timezone.now()
            room.save(update_fields=["closed_at"])
            audit(request, "lab.room.close", target=("test_room", room.id, room.label or "Тестовая комната"))
        return Response(room_payload(room))


class LabJoinView(APIView):
    """Вход по ссылке. Без аутентификации: устаревший JWT в браузере не должен мешать."""

    authentication_classes: list = []
    permission_classes = [AllowAny]
    throttle_classes = [LabJoinThrottle]

    def post(self, request):
        claims = read_lab_token(request.data.get("token") if isinstance(request.data, dict) else None)
        room = None
        if claims:
            try:
                room = TestRoom.objects.filter(pk=uuid.UUID(claims["room"])).first()
            except ValueError:
                room = None
        if room is None:
            return Response(
                {"detail": "Ссылка недействительна. Создайте новую тестовую комнату в лаборатории."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not room.is_active:
            return Response(
                {"detail": "Тестовая комната закрыта или её время вышло. Создайте новую в лаборатории."},
                status=status.HTTP_410_GONE,
            )
        role = claims["role"]
        other = "psychologist" if role == "client" else "client"
        peer = {"name": PEER_NAMES[other], "avatar_config": room.client_avatar if other == "client" else None, "photo_url": None}
        return Response({
            "room_id": str(room.webrtc_room_id),
            "ws_token": make_ws_token(f"lab:{room.id}:{role}", room.webrtc_room_id, role),
            "role": role,
            "peer": peer,
            "test_room": {
                "id": str(room.id),
                "label": room.label,
                "created_at": room.created_at.isoformat(),
                "expires_at": room.expires_at.isoformat(),
                "client_avatar": room.client_avatar,
            },
        })
