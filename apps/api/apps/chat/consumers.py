"""
WebSocket чатов: /ws/chat/?token=<POST /api/v1/chat/ws-token/>.

Сервер шлёт: message.new / message.updated / message.hidden / conversation.updated /
conversation.cleared / typing / read. Клиент шлёт: {"type":"typing","conversation":id},
{"type":"read","conversation":id}, {"type":"ping"}. Сообщения отправляются через REST.
"""
import json
import time
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from . import services

CLOSE_UNAUTHORIZED = 4001
TYPING_MIN_INTERVAL = 2.0


class ChatConsumer(AsyncWebsocketConsumer):
    user_id: str | None = None
    groups_joined: list[str]

    async def connect(self):
        from .views import validate_chat_ws_token

        self.groups_joined = []
        self._roles: dict[str, str | None] = {}
        self._last_typing: dict[str, float] = {}
        query = parse_qs((self.scope.get("query_string") or b"").decode())
        user_id = validate_chat_ws_token((query.get("token") or [None])[0])
        await self.accept()
        user, staff = await self._load_user(user_id) if user_id else (None, False)
        if user is None:
            await self.close(code=CLOSE_UNAUTHORIZED)
            return
        self.user = user
        self.user_id = str(user.id)
        self.groups_joined.append(services.user_group(user.id))
        if staff:
            self.groups_joined.append(services.SUPPORT_GROUP)
        for g in self.groups_joined:
            await self.channel_layer.group_add(g, self.channel_name)
        await self.send(text_data=json.dumps({"type": "ready"}))

    async def disconnect(self, code):
        for g in getattr(self, "groups_joined", []):
            await self.channel_layer.group_discard(g, self.channel_name)

    @database_sync_to_async
    def _load_user(self, user_id):
        from apps.users.models import User

        user = User.objects.filter(pk=user_id, is_active=True).first()
        return (user, services.is_support_staff(user)) if user else (None, False)

    @database_sync_to_async
    def _role_for(self, conv_id):
        from .models import Conversation

        conv = Conversation.objects.select_related("specialist").filter(pk=conv_id).first()
        return (conv, services.my_role(self.user, conv)) if conv else (None, None)

    @database_sync_to_async
    def _typing(self, conv, role):
        services.broadcast(conv, {"type": "typing", "conversation": str(conv.id), "role": role},
                           exclude_user=self.user.id)

    @database_sync_to_async
    def _read(self, conv, role):
        services.mark_read(conv, self.user, role)

    async def receive(self, text_data=None, bytes_data=None):
        if not self.user_id or not text_data or len(text_data) > 2048:
            return
        try:
            data = json.loads(text_data)
        except (json.JSONDecodeError, TypeError):
            return
        if not isinstance(data, dict):
            return
        kind = data.get("type")
        if kind == "ping":
            await self.send(text_data=json.dumps({"type": "pong"}))
            return
        if kind not in ("typing", "read"):
            return
        conv_id = str(data.get("conversation") or "")
        if len(conv_id) != 36:
            return
        try:
            conv, role = await self._role_for(conv_id)
        except Exception:  # noqa: BLE001 — некорректный UUID
            return
        if conv is None or role is None:
            return
        if kind == "typing":
            now = time.monotonic()
            if now - self._last_typing.get(conv_id, 0) < TYPING_MIN_INTERVAL:
                return
            self._last_typing[conv_id] = now
            await self._typing(conv, role)
        else:
            await self._read(conv, role)

    async def chat_event(self, event):
        payload = dict(event["event"])
        exclude = payload.pop("_exclude", None)
        if exclude and exclude == self.user_id:
            return
        sender = payload.pop("_sender", None)
        if "message" in payload and isinstance(payload["message"], dict):
            payload["message"] = {**payload["message"], "mine": bool(sender) and sender == self.user_id}
        await self.send(text_data=json.dumps(payload, ensure_ascii=False))
