"""
Групповой сигналинг для «Кругов»: комната на несколько пиров (mesh, до 14: ведущий, ко-терапевт и 12).

WebSocket: /ws/circle/<room_id>/?token=<POST /api/v1/circles/meetings/<id>/join/>

Сервер — только брокер. Каждый пир известен другим ТОЛЬКО по `id` (handle участия в
круге, "host" или "cohost") и псевдониму; id пользователей и alias никогда не уходят в сокет.

Комнаты для работы в малых группах (breakout): встреча = основная комната "main" + до 6
подкомнат. Каждый пир всегда ровно в одной комнате; SDP/ICE пересылаются ТОЛЬКО между пирами
одной комнаты, поэтому медиа-соединения (и звук) существуют только внутри комнаты.
Переводят ведущий и ко-терапевт; участник переходит сам, только если это разрешено ("free").

Клиент → сервер:
  {"type":"signal","to":<peer>,"data":{description|candidate|hint}}  — адресно пиру своей комнаты
      hint = {"video": bool} — «присылай / не присылай мне видео» (лимит видеопотоков на клиенте)
  {"type":"state", "muted"?, "video"?, "hand"?, "face"?, "audio_only"?}  — рассылается всем
  {"type":"bye"}
  {"type":"reaction","kind":"up"|"down"}  — 👍/👎 (жест или кнопка), пирам своей комнаты, ≤ 2/с
  модераторы (host, cohost): {"type":"mute-all"} · {"type":"mute","peer"} · {"type":"lower-hand","peer"}
           {"type":"remove","peer"} · {"type":"rooms-open","rooms":[name…],"assign":{peer:room},"minutes"?,"free"?}
           {"type":"move","peers":[…],"room"} · {"type":"rooms-close"} · {"type":"rooms-timer","minutes"}
           {"type":"broadcast","text"}
  только ведущий: {"type":"end"}
  участник (если free): {"type":"move-self","room"}
Сервер → клиент:
  welcome {self, role, peers:[{id,name,role,tone,state,room}], rooms} · peer-joined {peer} · peer-left {id}
  signal {from,data} · peer-state {id,state} · rooms {rooms,assign,ends_at,free,now,moved,by}
  broadcast {text,from} · mute-request · hand-lowered · removed · ended · reaction {id,kind}

Кто в комнате — по ключу кэша на каждого пира (gsig:<room>:<peer> → channel). Список
возможных пиров берётся из БД (участники круга), поэтому гонок при записи списка нет.
Повторное подключение того же пира вытесняет старое соединение (close 4000).
"""
import json
import logging
import time
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.core import signing
from django.core.cache import cache

logger = logging.getLogger(__name__)

GROUP_TOKEN_SALT = "aprosop-circle-ws"
GROUP_TOKEN_MAX_AGE = 4 * 60 * 60
SLOT_TTL = 4 * 60 * 60
MAX_PEERS = 14  # ведущий + ко-терапевт + 12 участников; дальше — нужен SFU (docs/CIRCLES.md)
MAIN_ROOM = "main"
MAX_ROOMS = 6
MODERATORS = ("host", "cohost")

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
    if data.get("role") not in ("host", "cohost", "member") or not data.get("p") or not data.get("u"):
        return None
    return data


def _slot(room: str, peer: str) -> str:
    return f"gsig:{room}:{peer}"


def _state_key(room: str, peer: str) -> str:
    return f"gsig:{room}:{peer}:state"


def _rooms_key(room: str) -> str:
    return f"gsig:{room}:rooms"


def empty_rooms() -> dict:
    return {"rooms": [], "assign": {}, "ends_at": None, "free": False}


def room_of(rs: dict, peer: str) -> str:
    rid = (rs.get("assign") or {}).get(peer, MAIN_ROOM)
    return rid if any(r["id"] == rid for r in rs.get("rooms") or []) else MAIN_ROOM


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

        rs = await self._rooms()
        peers = []
        for pid in present:
            info = self.roster.get(pid, {})
            peers.append({"id": pid, **info, "state": await cache.aget(_state_key(self.room, pid)) or {},
                          "room": room_of(rs, pid)})
        await self.send(text_data=json.dumps({
            "type": "welcome", "self": self.peer, "role": self.role, "peers": peers,
            "allow_real_faces": self.allow_real, "rooms": self._rooms_view(rs),
        }, ensure_ascii=False))
        await self.channel_layer.group_send(self.group, {
            "type": "peer.joined", "channel": self.channel_name,
            "peer": {"id": self.peer, **self.roster.get(self.peer, {}), "state": {}, "room": room_of(rs, self.peer)},
        })

    @database_sync_to_async
    def _roster(self, claims):
        """Все возможные пиры этой встречи или None, если доступа уже нет (исключён, встреча закрыта)."""
        from apps.circles.models import Meeting, Membership
        from apps.circles.services import room_open

        meeting = Meeting.objects.select_related("circle", "circle__host", "circle__cohost").filter(
            pk=claims.get("m"), room_id=self.room).first()
        if meeting is None or str(meeting.circle_id) != claims.get("c") or room_open(meeting) is not None:
            return None
        circle = meeting.circle
        members = Membership.objects.filter(circle=circle, status=Membership.Status.ACTIVE)
        roster = {"host": {"name": circle.host.display_name, "role": "host", "tone": "primary"}}
        co = circle.active_cohost
        if co is not None:
            roster["cohost"] = {"name": co.display_name, "role": "cohost", "tone": "primary"}
        for m in members:
            roster[m.handle] = {"name": m.pseudonym, "role": "member", "tone": m.tone}
        if claims["role"] == "host":
            if str(circle.host.user_id) != claims["u"] or claims["p"] != "host":
                return None
        elif claims["role"] == "cohost":
            if co is None or str(co.user_id) != claims["u"] or claims["p"] != "cohost":
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
            rs = await self._rooms()
            if room_of(rs, to) != room_of(rs, self.peer):
                return  # разные комнаты: соединений между ними нет
            out = {k: payload[k] for k in ("description", "candidate") if k in payload}
            hint = payload.get("hint")
            if isinstance(hint, dict) and "video" in hint:
                out["hint"] = {"video": bool(hint["video"])}
            if out:
                await self._to_peer(to, {"type": "direct.signal", "from": self.peer, "data": out})
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
        elif kind == "reaction":
            k = data.get("kind")
            now = time.monotonic()
            if k in ("up", "down") and now - getattr(self, "_last_reaction", 0.0) >= 0.5:
                self._last_reaction = now
                rs = await self._rooms()
                await self.channel_layer.group_send(self.group, {"type": "peer.reaction", "id": self.peer, "kind": k,
                                                                 "room": room_of(rs, self.peer)})
        elif kind == "bye":
            await self.close()
        elif kind == "move-self":
            rs = await self._rooms()
            target = str(data.get("room") or "")
            if (rs.get("free") or self.role in MODERATORS) and self._room_exists(rs, target):
                await self._assign(rs, [self.peer], target)
        elif self.role in MODERATORS and kind in ("rooms-open", "move", "rooms-close", "rooms-timer", "broadcast"):
            await self._rooms_action(kind, data)
        elif kind == "end" and self.role == "host":
            await self._end_meeting()
        elif self.role in MODERATORS and kind in ("mute-all", "mute", "lower-hand", "remove"):
            await self._host_action(kind, str(data.get("peer") or ""))

    # ── комнаты (breakout) ──
    async def _rooms(self) -> dict:
        return await cache.aget(_rooms_key(self.room)) or empty_rooms()

    @staticmethod
    def _room_exists(rs: dict, rid: str) -> bool:
        return rid == MAIN_ROOM or any(r["id"] == rid for r in rs.get("rooms") or [])

    @staticmethod
    def _rooms_view(rs: dict) -> dict:
        return {"rooms": rs.get("rooms") or [], "assign": rs.get("assign") or {}, "ends_at": rs.get("ends_at"),
                "free": bool(rs.get("free")), "now": time.time()}

    async def _save_rooms(self, rs: dict, moved=(), note: str = ""):
        await cache.aset(_rooms_key(self.room), rs, timeout=SLOT_TTL)
        await self.channel_layer.group_send(self.group, {
            "type": "rooms.update", "state": rs, "moved": list(moved), "by": self.roster.get(self.peer, {}).get("name", ""),
            "note": note,
        })

    async def _assign(self, rs: dict, peers, target: str, note: str = ""):
        assign = dict(rs.get("assign") or {})
        moved = []
        for pid in peers:
            if pid not in self.roster:
                continue
            if room_of(rs, pid) != target:
                moved.append(pid)
            if target == MAIN_ROOM:
                assign.pop(pid, None)
            else:
                assign[pid] = target
        rs = {**rs, "assign": assign}
        await self._save_rooms(rs, moved, note)

    async def _rooms_action(self, kind: str, data: dict):
        rs = await self._rooms()
        if kind == "rooms-open":
            names = data.get("rooms")
            if isinstance(names, int):
                names = [f"Комната {i + 1}" for i in range(names)]
            if not isinstance(names, list):
                return
            rooms = [{"id": f"r{i + 1}", "name": (str(n).strip()[:40] or f"Комната {i + 1}")}
                     for i, n in enumerate(names[:MAX_ROOMS])]
            if not rooms:
                return
            ids = {r["id"] for r in rooms}
            raw = data.get("assign") if isinstance(data.get("assign"), dict) else {}
            assign = {str(p): str(r) for p, r in raw.items() if str(p) in self.roster and str(r) in ids}
            old = rs
            rs = {"rooms": rooms, "assign": assign, "ends_at": self._ends(data.get("minutes")),
                  "free": bool(data.get("free"))}
            moved = [p for p in self.roster if room_of(old, p) != room_of(rs, p)]
            await self._save_rooms(rs, moved)
        elif kind == "move":
            peers = data.get("peers") if isinstance(data.get("peers"), list) else [data.get("peer")]
            target = str(data.get("room") or MAIN_ROOM)
            if self._room_exists(rs, target):
                await self._assign(rs, [str(p) for p in peers if p][:32], target)
        elif kind == "rooms-close":
            moved = [p for p in self.roster if room_of(rs, p) != MAIN_ROOM]
            await self._save_rooms(empty_rooms(), moved, "closed")
        elif kind == "rooms-timer":
            if rs.get("rooms"):
                await self._save_rooms({**rs, "ends_at": self._ends(data.get("minutes"))})
        elif kind == "broadcast":
            text = str(data.get("text") or "").strip()[:300]
            if text:
                await self.channel_layer.group_send(self.group, {
                    "type": "room.broadcast", "text": text, "from": self.roster.get(self.peer, {}).get("name", ""),
                })

    @staticmethod
    def _ends(minutes):
        try:
            m = int(minutes)
        except (TypeError, ValueError):
            return None
        return time.time() + m * 60 if 1 <= m <= 120 else None

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
        elif kind == "remove" and peer in self.roster and peer not in MODERATORS:
            await self._remove_member(peer)  # также присылает peer.kick через группу

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

    async def peer_reaction(self, event):
        if event["id"] == self.peer:
            return
        rs = await self._rooms()
        if room_of(rs, self.peer) == event.get("room"):
            await self.send(text_data=json.dumps({"type": "reaction", "id": event["id"], "kind": event["kind"]}))

    async def peer_state(self, event):
        if event["id"] != self.peer:
            await self.send(text_data=json.dumps({"type": "peer-state", "id": event["id"], "state": event["state"]}))

    async def rooms_update(self, event):
        view = self._rooms_view(event["state"])
        await self.send(text_data=json.dumps({
            "type": "rooms", **view, "moved": self.peer in event.get("moved", []), "by": event.get("by", ""),
            "note": event.get("note", ""),
        }, ensure_ascii=False))

    async def room_broadcast(self, event):
        await self.send(text_data=json.dumps({"type": "broadcast", "text": event["text"], "from": event["from"]},
                                             ensure_ascii=False))

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
