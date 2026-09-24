"""
WebRTC Signaling Consumer (Django Channels)
--------------------------------------------
Сервер — только сигнальный брокер. Медиапоток (видео/аудио) идёт P2P
между клиентом и психологом через WebRTC, минуя сервер.
Сервер видит только: тип сигнала (offer/answer/ice-candidate), room_id.

Доступ: ?token=<ws_token> из POST /api/v1/sessions/{id}/join/
(django.core.signing, 3 часа, user_id + room_id + role). Невалидный → close 4001.
В комнате максимум 2 участника: по одному месту на роль (client, psychologist).
Повторное подключение той же роли вытесняет старое соединение (close 4000),
поэтому «зависшее» соединение не блокирует комнату.
"""
import json
import logging
from urllib.parse import parse_qs

from channels.generic.websocket import AsyncWebsocketConsumer
from django.core.cache import cache

from .tokens import validate_ws_token

logger = logging.getLogger(__name__)

MAX_ROOM_PARTICIPANTS = 2
SLOT_TTL = 3 * 60 * 60
ROLES = ("client", "psychologist")
ALLOWED_TYPES = {"offer", "answer", "ice-candidate", "ready", "bye"}

CLOSE_REPLACED = 4000
CLOSE_UNAUTHORIZED = 4001
CLOSE_ROOM_FULL = 4003


def _slot_key(room_id: str, role: str) -> str:
    return f"signaling:{room_id}:{role}"


class SignalingConsumer(AsyncWebsocketConsumer):
    room_id = None
    role = None
    joined = False
    replaced = False

    async def connect(self):
        self.room_id = self.scope["url_route"]["kwargs"]["room_id"]
        self.group_name = f"signaling_{self.room_id}"

        query = parse_qs((self.scope.get("query_string") or b"").decode())
        token = (query.get("token") or [None])[0]
        claims = validate_ws_token(token, self.room_id)
        # accept → close, чтобы браузер получил код закрытия
        await self.accept()
        if claims is None:
            await self.close(code=CLOSE_UNAUTHORIZED)
            return
        self.role = claims["role"]

        occupied = 0
        for role in ROLES:
            if role != self.role and await cache.aget(_slot_key(self.room_id, role)):
                occupied += 1
        if occupied >= MAX_ROOM_PARTICIPANTS:
            await self.close(code=CLOSE_ROOM_FULL)
            return

        key = _slot_key(self.room_id, self.role)
        previous = await cache.aget(key)
        await cache.aset(key, self.channel_name, timeout=SLOT_TTL)
        if previous and previous != self.channel_name:
            await self.channel_layer.send(previous, {"type": "force.close"})

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        self.joined = True
        await self.channel_layer.group_send(
            self.group_name,
            {"type": "peer.joined", "channel": self.channel_name},
        )
        logger.info("Signaling: %s joined room %s", self.role, self.room_id)

    async def disconnect(self, close_code):
        if not self.joined:
            return
        self.joined = False
        key = _slot_key(self.room_id, self.role)
        if await cache.aget(key) == self.channel_name:
            await cache.adelete(key)
        await self.channel_layer.group_discard(self.group_name, self.channel_name)
        if not self.replaced:
            await self.channel_layer.group_send(
                self.group_name,
                {"type": "peer.left", "channel": self.channel_name},
            )
        logger.info("Signaling: %s left room %s", self.role, self.room_id)

    async def receive(self, text_data=None, bytes_data=None):
        if not self.joined or not text_data or len(text_data) > 64 * 1024:
            return
        try:
            data = json.loads(text_data)
        except (json.JSONDecodeError, TypeError):
            return
        if not isinstance(data, dict) or data.get("type") not in ALLOWED_TYPES:
            return
        # Ретранслируем сигнал всем в комнате кроме отправителя
        await self.channel_layer.group_send(
            self.group_name,
            {"type": "relay.signal", "sender_channel": self.channel_name, "payload": data},
        )

    async def relay_signal(self, event):
        if event["sender_channel"] == self.channel_name:
            return
        await self.send(text_data=json.dumps(event["payload"]))

    async def peer_joined(self, event):
        if event["channel"] != self.channel_name:
            await self.send(text_data=json.dumps({"type": "peer-joined"}))

    async def peer_left(self, event):
        if event["channel"] != self.channel_name:
            await self.send(text_data=json.dumps({"type": "peer-left"}))

    async def force_close(self, event):
        # Та же роль подключилась заново — старое соединение уходит молча
        self.replaced = True
        await self.close(code=CLOSE_REPLACED)
