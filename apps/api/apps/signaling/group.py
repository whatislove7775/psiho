"""
Групповой сигналинг для «Кругов»: комната на несколько пиров (mesh, до 9: ведущий + 8).

WebSocket: /ws/circle/<room_id>/?token=<POST /api/v1/circles/meetings/<id>/join/>

Сервер — только брокер. Каждый пир известен другим ТОЛЬКО по `id` (handle участия в
круге или "host") и псевдониму; id пользователей и alias никогда не уходят в сокет.

Клиент → сервер:
  {"type":"signal","to":<peer>,"data":{description|candidate}}   — адресно одному пиру
  {"type":"state", "muted"?, "video"?, "hand"?, "face"?, "audio_only"?}  — рассылается всем
  {"type":"bye"}
  ведущий: {"type":"mute-all"} · {"type":"mute","peer"} · {"type":"lower-hand","peer"}
           {"type":"remove","peer"} · {"type":"end"}
Сервер → клиент:
  welcome {self, role, peers:[{id,name,role,tone,state}]} · peer-joined {peer} · peer-left {id}
  signal {from,data} · peer-state {id,state} · mute-request · hand-lowered · removed · ended

Кто в комнате — по ключу кэша на каждого пира (gsig:<room>:<peer> → channel). Список
возможных пиров берётся из БД (участники круга), поэтому гонок при записи списка нет.
Повторное подключение того же пира вытесняет старое соединение (close 4000).
"""
import json
import logging
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.core import signing
from django.core.cache import cache

logger = logging.getLogger(__name__)

GROUP_TOKEN_SALT = "aprosop-circle-ws"
GROUP_TOKEN_MAX_AGE = 4 * 60 * 60
SLOT_TTL = 4 * 60 * 60
MAX_PEERS = 9  # ведущий + 8 участников; дальше — нужен SFU (docs/CIRCLES.md)

CLOSE_REPLACED = 4000
CLOSE_UNAUTHORIZED = 4001
CLOSE_ROOM_FULL = 4003
CLOSE_REMOVED = 4004
CLOSE_ENDED = 4005

STATE_KEYS = {"muted": bool, "video": bool, "hand": bool, "audio_only": bool}


def make_group_token(*, user_id, room_id, peer: str, role: str, circle_id, meeting_id) -> str:
    return signing.dumps(
        {"u": str(user_id), "r": str(room_id), "p": peer, "role": role, "c": str(circle_id), "m": str(meeting_id)},
        salt=GROUP_TOKEN_SALT, compress=True,
    )


def validate_group_token(token: str | None, room_id) -> dict | None:
    if not token:
        return None
    try:
        data = signing.loads(token, salt=GROUP_TOKEN_SALT, max_age=GROUP_TOKEN_MAX_AGE)
    except (signing.BadSignature, signing.SignatureExpired, ValueError, TypeError):
        return None
    if not isinstance(data, dict) or str(data.get("r")) != str(room_id):
        return None
    if data.get("role") not in ("host", "member") or not data.get("p") or not data.get("u"):
        return None
    return data


def _slot(room: str, peer: str) -> str:
    return f"gsig:{room}:{peer}"


def _state_key(room: str, peer: str) -> str:
    return f"gsig:{room}:{peer}:state"


def group_name(room_id) -> str:
    return f"gsig_{str(room_id).replace('-', '')}"


class GroupSignalingConsumer(AsyncWebsocketConsumer):
    joined = False
    replaced = False
    peer = None

    async def connect(self):
        self.room = self.scope["url_route"]["kwargs"]["room_id"]
        self.group = group_name(self.room)
        query = parse_qs((self.scope.get("query_string") or b"").decode())
        claims = validate_group_token((query.get("token") or [None])[0], self.room)
        await self.accept()
        if claims is None:
            await self.close(code=CLOSE_UNAUTHORIZED)
            return
        roster = await self._roster(claims)
        if roster is None:
            await self.close(code=CLOSE_UNAUTHORIZED)
            return
        self.peer = claims["p"]
        self.role = claims["role"]
        self.roster = roster  # peer id → {name, role, tone}
        self.allow_real = roster.pop("__allow_real__")["value"]

        present = []
        for pid in self.roster:
            if pid != self.peer and await cache.aget(_slot(self.room, pid)):
                present.append(pid)
        if len(present) >= MAX_PEERS:
            await self.close(code=CLOSE_ROOM_FULL)
            return

        key = _slot(self.room, self.peer)
        previous = await cache.aget(key)
        await cache.aset(key, self.channel_name, timeout=SLOT_TTL)
        if previous and previous != self.channel_name:
            await self.channel_layer.send(previous, {"type": "force.close"})
        await cache.aset(_state_key(self.room, self.peer), {}, timeout=SLOT_TTL)
        await self.channel_layer.group_add(self.group, self.channel_name)
        self.joined = True

        peers = []
        for pid in present:
            info = self.roster.get(pid, {})
            peers.append({"id": pid, **info, "state": await cache.aget(_state_key(self.room, pid)) or {}})
        await self.send(text_data=json.dumps({
            "type": "welcome", "self": self.peer, "role": self.role, "peers": peers,
            "allow_real_faces": self.allow_real,
        }, ensure_ascii=False))
        await self.channel_layer.group_send(self.group, {
            "type": "peer.joined", "channel": self.channel_name,
            "peer": {"id": self.peer, **self.roster.get(self.peer, {}), "state": {}},
        })

    @database_sync_to_async
    def _roster(self, claims):
        """Все возможные пиры этой встречи или None, если доступа уже нет (исключён, встреча закрыта)."""
        from apps.circles.models import Meeting, Membership
        from apps.circles.services import room_open

        meeting = Meeting.objects.select_related("circle", "circle__host").filter(
            pk=claims.get("m"), room_id=self.room).first()
        if meeting is None or str(meeting.circle_id) != claims.get("c") or room_open(meeting) is not None:
            return None
        circle = meeting.circle
        members = Membership.objects.filter(circle=circle, status=Membership.Status.ACTIVE)
        roster = {"host": {"name": circle.host.display_name, "role": "host", "tone": "primary"}}
        for m in members:
            roster[m.handle] = {"name": m.pseudonym, "role": "member", "tone": m.tone}
        if claims["role"] == "host":
            if str(circle.host.user_id) != claims["u"] or claims["p"] != "host":
                return None
        elif not members.filter(handle=claims["p"], user_id=claims["u"]).exists():
            return None
        roster["__allow_real__"] = {"value": circle.allow_real_faces}
        return roster

    async def disconnect(self, code):
        await self._leave()

    async def _leave(self):
        """Освободить место и сообщить остальным (идемпотентно: и при закрытии сервером, и клиентом)."""
        if not self.joined:
            return
        self.joined = False
        key = _slot(self.room, self.peer)
        if await cache.aget(key) == self.channel_name:
            await cache.adelete(key)
            await cache.adelete(_state_key(self.room, self.peer))
        await self.channel_layer.group_discard(self.group, self.channel_name)
        if not self.replaced:
            await self.channel_layer.group_send(self.group, {"type": "peer.left", "id": self.peer,
                                                             "channel": self.channel_name})

    async def _to_peer(self, peer: str, event: dict) -> bool:
        channel = await cache.aget(_slot(self.room, peer))
        if not channel:
            return False
        await self.channel_layer.send(channel, event)
        return True

    async def receive(self, text_data=None, bytes_data=None):
        if not self.joined or not text_data or len(text_data) > 64 * 1024:
            return
        try:
            data = json.loads(text_data)
        except (json.JSONDecodeError, TypeError):
            return
        if not isinstance(data, dict):
            return
        kind = data.get("type")
        if kind == "signal":
            to = str(data.get("to") or "")
            payload = data.get("data")
            if to == self.peer or to not in self.roster or not isinstance(payload, dict):
                return
            payload = {k: payload[k] for k in ("description", "candidate") if k in payload}
            await self._to_peer(to, {"type": "direct.signal", "from": self.peer, "data": payload})
        elif kind == "state":
            key = _state_key(self.room, self.peer)
            state = await cache.aget(key) or {}
            for k, typ in STATE_KEYS.items():
                if k in data:
                    state[k] = bool(data[k])
            if "face" in data:
                real = data.get("face") == "real" and (self.role == "host" or self.allow_real)
                state["face"] = "real" if real else "avatar"
            await cache.aset(key, state, timeout=SLOT_TTL)
            await self.channel_layer.group_send(self.group, {"type": "peer.state", "id": self.peer, "state": state})
        elif kind == "bye":
            await self.close()
        elif self.role == "host" and kind in ("mute-all", "mute", "lower-hand", "remove", "end"):
            await self._host_action(kind, str(data.get("peer") or ""))

    async def _host_action(self, kind: str, peer: str):
        if kind == "mute-all":
            await self.channel_layer.group_send(self.group, {"type": "host.mute", "except": self.peer})
        elif kind == "mute" and peer in self.roster:
            await self._to_peer(peer, {"type": "host.mute", "except": ""})
        elif kind == "lower-hand" and peer in self.roster:
            state = await cache.aget(_state_key(self.room, peer)) or {}
            state["hand"] = False
            await cache.aset(_state_key(self.room, peer), state, timeout=SLOT_TTL)
            await self.channel_layer.group_send(self.group, {"type": "peer.state", "id": peer, "state": state})
            await self._to_peer(peer, {"type": "host.lowerhand"})
        elif kind == "remove" and peer in self.roster and peer != "host":
            await self._remove_member(peer)  # также присылает peer.kick через группу
        elif kind == "end":
            await self._end_meeting()

    @database_sync_to_async
    def _remove_member(self, handle: str):
        from apps.circles.models import Membership
        from apps.circles.services import remove_member

        m = Membership.objects.filter(handle=handle, circle__meetings__room_id=self.room).first()
        if m is not None:
            remove_member(m)

    @database_sync_to_async
    def _end_meeting(self):
        from apps.circles.models import Meeting
        from apps.circles.services import end_meeting

        meeting = Meeting.objects.filter(room_id=self.room).first()
        if meeting is not None:
            end_meeting(meeting)

    # ── события группы ──
    async def direct_signal(self, event):
        await self.send(text_data=json.dumps({"type": "signal", "from": event["from"], "data": event["data"]}))

    async def peer_joined(self, event):
        if event["channel"] != self.channel_name:
            peer = event["peer"]
            self.roster.setdefault(peer["id"], {k: peer.get(k) for k in ("name", "role", "tone")})
            await self.send(text_data=json.dumps({"type": "peer-joined", "peer": peer}, ensure_ascii=False))

    async def peer_left(self, event):
        if event["channel"] != self.channel_name:
            await self.send(text_data=json.dumps({"type": "peer-left", "id": event["id"]}))

    async def peer_state(self, event):
        if event["id"] != self.peer:
            await self.send(text_data=json.dumps({"type": "peer-state", "id": event["id"], "state": event["state"]}))

    async def host_mute(self, event):
        if event.get("except") != self.peer:
            await self.send(text_data=json.dumps({"type": "mute-request"}))

    async def host_lowerhand(self, event):
        await self.send(text_data=json.dumps({"type": "hand-lowered"}))

    async def peer_kick(self, event):
        if event.get("peer") == self.peer:
            await self.send(text_data=json.dumps({"type": "removed"}))
            await self._leave()
            await self.close(code=CLOSE_REMOVED)
        else:
            self.roster.pop(event.get("peer"), None)

    async def room_end(self, event):
        await self.send(text_data=json.dumps({"type": "ended"}))
        await self._leave()
        await self.close(code=CLOSE_ENDED)

    async def force_close(self, event):
        self.replaced = True
        await self.close(code=CLOSE_REPLACED)
