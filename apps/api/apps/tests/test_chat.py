"""Чаты: доступ, файлы, удаление, хранение, шифрование, ИИ-помощник (API замокан)."""
import json
from datetime import timedelta
from unittest import mock

import pytest
from asgiref.sync import async_to_sync
from channels.testing import WebsocketCommunicator
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.utils import timezone

from apps.chat import ai, crypto
from apps.chat.models import AIDailyUsage, Attachment, Conversation, Message
from apps.sessions.models import ConsultationSession
from apps.users.models import User

from .conftest import auth_client

PDF = b"%PDF-1.4\n" + b"x" * 200
WEBM = b"\x1a\x45\xdf\xa3" + b"\x00" * 200


def book(client_user, profile, status=ConsultationSession.Status.PAID):
    return ConsultationSession.objects.create(
        client=client_user, psychologist_profile=profile, status=status,
        scheduled_at=timezone.now() + timedelta(days=1), amount_kopecks=300000,
    )


def open_chat(c, psychologist):
    resp = c.post("/api/v1/chat/conversations/", {"with": "specialist", "psychologist_id": psychologist.id},
                  format="json")
    assert resp.status_code in (200, 201), resp.content
    return resp.json()


@pytest.fixture
def other_client(db):
    return User.objects.create_anonymous_client("otherpass123")


@pytest.fixture
def pair(client_user, psychologist):
    book(client_user, psychologist)
    c = auth_client(client_user)
    conv = open_chat(c, psychologist)
    return c, auth_client(psychologist.user), conv


# ── Доступ ────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_client_needs_booking_to_chat_specialist(client_user, psychologist, settings):
    # Прежнее правило «только после записи» включается CHAT_ALLOW_WITHOUT_BOOKING=False
    settings.CHAT_ALLOW_WITHOUT_BOOKING = False
    c = auth_client(client_user)
    resp = c.post("/api/v1/chat/conversations/", {"with": "specialist", "psychologist_id": psychologist.id},
                  format="json")
    assert resp.status_code == 403
    assert c.get("/api/v1/chat/contacts/").json() == []

    # По умолчанию (диалоги) клиент может начать разговор без записи — с антиспам-лимитами
    settings.CHAT_ALLOW_WITHOUT_BOOKING = True
    assert len(c.get("/api/v1/chat/contacts/").json()) == 1
    assert open_chat(c, psychologist)["counterpart"]["name"] == "Анна"


@pytest.mark.django_db
def test_conversation_visibility(pair, client_user, other_client, admin_user, psychologist):
    c, p, conv = pair
    assert conv["my_role"] == "client" and conv["counterpart"]["type"] == "specialist"
    # Специалист видит клиента только по псевдониму
    pconv = p.get(f"/api/v1/chat/conversations/{conv['id']}/").json()
    assert pconv["counterpart"] == {"type": "client", "name": client_user.alias,
                                    "avatar_config": client_user.avatar_config}
    assert "email" not in json.dumps(pconv)
    # Посторонний клиент и даже администратор не видят личный чат
    for outsider in (auth_client(other_client), auth_client(admin_user)):
        assert outsider.get(f"/api/v1/chat/conversations/{conv['id']}/").status_code == 404
        assert outsider.get(f"/api/v1/chat/conversations/{conv['id']}/messages/").status_code == 404
    a = auth_client(admin_user)
    assert a.get("/api/v1/chat/conversations/?scope=support").json() == []
    assert c.get("/api/v1/chat/conversations/?scope=support").status_code == 403


@pytest.mark.django_db
def test_specialist_can_start_chat_with_own_client_only(psychologist, client_user, other_client):
    book(client_user, psychologist)
    p = auth_client(psychologist.user)
    assert [x["client_alias"] for x in p.get("/api/v1/chat/contacts/").json()] == [client_user.alias]
    ok = p.post("/api/v1/chat/conversations/", {"with": "client", "client_alias": client_user.alias}, format="json")
    assert ok.status_code == 201
    bad = p.post("/api/v1/chat/conversations/", {"with": "client", "client_alias": other_client.alias}, format="json")
    assert bad.status_code == 400


@pytest.mark.django_db
def test_support_chat_and_staff_inbox(client_user, admin_user, psychologist):
    c = auth_client(client_user)
    conv = c.post("/api/v1/chat/conversations/", {"with": "support"}, format="json").json()
    assert conv["kind"] == "client_support" and conv["counterpart"]["name"] == "Поддержка aprosop"
    c.post(f"/api/v1/chat/conversations/{conv['id']}/messages/", {"text": "Не могу оплатить"}, format="json")

    a = auth_client(admin_user)
    inbox = a.get("/api/v1/chat/conversations/?scope=support").json()
    assert len(inbox) == 1 and inbox[0]["counterpart"]["name"] == client_user.alias
    assert inbox[0]["unread"] == 1 and inbox[0]["my_role"] == "support"
    reply = a.post(f"/api/v1/chat/conversations/{conv['id']}/messages/", {"text": "Сейчас поможем"}, format="json")
    assert reply.status_code == 201 and reply.json()["sender_role"] == "support"
    msgs = c.get(f"/api/v1/chat/conversations/{conv['id']}/messages/").json()["results"]
    assert [m["sender_role"] for m in msgs] == ["system", "client", "support"]
    assert c.get("/api/v1/chat/unread/").json()["total"] == 1

    # Специалист тоже может написать в поддержку, и файлы ему доступны
    p = auth_client(psychologist.user)
    pc = p.post("/api/v1/chat/conversations/", {"with": "support"}, format="json").json()
    assert pc["kind"] == "specialist_support" and pc["can_send_files"] is True
    assert len(a.get("/api/v1/chat/conversations/?scope=support").json()) == 2


# ── Файлы и голосовые ─────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_only_specialist_and_support_send_files(pair, client_user, admin_user):
    c, p, conv = pair
    url = f"/api/v1/chat/conversations/{conv['id']}/messages/"
    resp = c.post(url, {"kind": "file", "file": SimpleUploadedFile("a.pdf", PDF, "application/pdf")},
                  format="multipart")
    assert resp.status_code == 403

    resp = p.post(url, {"kind": "file", "file": SimpleUploadedFile("план.pdf", PDF, "application/pdf")},
                  format="multipart")
    assert resp.status_code == 201, resp.content
    msg = resp.json()
    assert msg["attachment"]["name"] == "план.pdf" and msg["attachment"]["mime"] == "application/pdf"

    # Скачивание — только участникам, расшифрованное
    dl = c.get(f"/api/v1/chat/messages/{msg['id']}/attachment/")
    assert dl.status_code == 200 and dl.content == PDF
    assert dl["Cache-Control"] == "private, no-store"
    assert auth_client(admin_user).get(f"/api/v1/chat/messages/{msg['id']}/attachment/").status_code == 404
    # На диске (в БД) — зашифровано
    stored = bytes(Attachment.objects.get(message_id=msg["id"]).data_enc)
    assert PDF not in stored and b"%PDF" not in stored

    # Подмена типа и неразрешённые расширения
    fake = p.post(url, {"kind": "file", "file": SimpleUploadedFile("x.pdf", b"MZ" + b"0" * 100)}, format="multipart")
    assert fake.status_code == 400
    exe = p.post(url, {"kind": "file", "file": SimpleUploadedFile("x.exe", b"MZ" + b"0" * 100)}, format="multipart")
    assert exe.status_code == 400

    # Клиент может отправить голосовое
    voice = c.post(url, {"kind": "voice", "file": SimpleUploadedFile("v.webm", WEBM, "audio/webm"),
                         "duration_ms": "3200", "peaks": json.dumps([0.1, 0.5, 2, -1])}, format="multipart")
    assert voice.status_code == 201, voice.content
    assert voice.json()["attachment"]["peaks"] == [0.1, 0.5, 1.0, 0.0]
    assert voice.json()["attachment"]["duration_ms"] == 3200


@pytest.mark.django_db
def test_file_size_limit(pair, settings):
    c, p, conv = pair
    settings.CHAT_MAX_FILE_MB = 1
    big = SimpleUploadedFile("big.pdf", b"%PDF" + b"0" * (1024 * 1024 + 10), "application/pdf")
    resp = p.post(f"/api/v1/chat/conversations/{conv['id']}/messages/", {"kind": "file", "file": big},
                  format="multipart")
    assert resp.status_code == 400


# ── Изменение и удаление ──────────────────────────────────────────────────────

@pytest.mark.django_db
def test_edit_and_delete(pair):
    c, p, conv = pair
    url = f"/api/v1/chat/conversations/{conv['id']}/messages/"
    mid = c.post(url, {"text": "Привет"}, format="json").json()["id"]

    assert p.patch(f"/api/v1/chat/messages/{mid}/", {"text": "взлом"}, format="json").status_code == 403
    edited = c.patch(f"/api/v1/chat/messages/{mid}/", {"text": "Здравствуйте"}, format="json").json()
    assert edited["text"] == "Здравствуйте" and edited["edited_at"]

    # Чужое сообщение нельзя удалить у всех
    assert p.post(f"/api/v1/chat/messages/{mid}/delete/", {"for": "all"}, format="json").status_code == 403
    # Удалить у себя — пропадает только у себя
    assert p.post(f"/api/v1/chat/messages/{mid}/delete/", {"for": "me"}, format="json").status_code == 204
    assert p.get(url).json()["results"] == []
    assert len(c.get(url).json()["results"]) == 1

    # Удалить у всех — надгробие без текста
    gone = c.post(f"/api/v1/chat/messages/{mid}/delete/", {"for": "all"}, format="json").json()
    assert gone["deleted"] is True and gone["text"] == ""
    assert bytes(Message.objects.get(pk=mid).text_enc) == b""
    assert c.patch(f"/api/v1/chat/messages/{mid}/", {"text": "снова"}, format="json").status_code == 400


@pytest.mark.django_db
def test_delete_for_everyone_removes_file(pair):
    c, p, conv = pair
    url = f"/api/v1/chat/conversations/{conv['id']}/messages/"
    mid = p.post(url, {"kind": "file", "file": SimpleUploadedFile("a.pdf", PDF)}, format="multipart").json()["id"]
    p.post(f"/api/v1/chat/messages/{mid}/delete/", {"for": "all"}, format="json")
    assert not Attachment.objects.filter(message_id=mid).exists()
    assert c.get(f"/api/v1/chat/messages/{mid}/attachment/").status_code == 404


@pytest.mark.django_db
def test_clear_chat_only_for_me(pair):
    c, p, conv = pair
    url = f"/api/v1/chat/conversations/{conv['id']}/messages/"
    c.post(url, {"text": "раз"}, format="json")
    p.post(url, {"text": "два"}, format="json")
    assert c.post(f"/api/v1/chat/conversations/{conv['id']}/clear/").status_code == 200
    assert c.get(url).json()["results"] == []
    assert len(p.get(url).json()["results"]) == 2
    c.post(url, {"text": "три"}, format="json")
    assert [m["text"] for m in c.get(url).json()["results"]] == ["три"]


@pytest.mark.django_db
def test_pagination_and_unread(pair):
    c, p, conv = pair
    url = f"/api/v1/chat/conversations/{conv['id']}/messages/"
    for i in range(5):
        p.post(url, {"text": f"m{i}"}, format="json")
    assert c.get("/api/v1/chat/unread/").json()["total"] == 5
    page = c.get(url, {"limit": 2}).json()
    assert [m["text"] for m in page["results"]] == ["m3", "m4"] and page["has_more"]
    older = c.get(url, {"limit": 10, "before": page["results"][0]["id"]}).json()
    assert [m["text"] for m in older["results"]] == ["m0", "m1", "m2"] and not older["has_more"]
    r = c.post(f"/api/v1/chat/conversations/{conv['id']}/read/")
    assert r.status_code == 200, r.content
    assert c.get("/api/v1/chat/unread/").json()["total"] == 0
    assert p.get(f"/api/v1/chat/conversations/{conv['id']}/").json()["peer_read_at"]


# ── Хранение и шифрование ─────────────────────────────────────────────────────

@pytest.mark.django_db
def test_retention_and_purge(pair):
    c, p, conv = pair
    url = f"/api/v1/chat/conversations/{conv['id']}/messages/"
    keep = c.post(url, {"text": "навсегда"}, format="json").json()
    assert keep["expires_at"] is None

    # Режим выбирает только клиент
    assert p.patch(f"/api/v1/chat/conversations/{conv['id']}/", {"retention": "24h"}, format="json").status_code == 403
    upd = c.patch(f"/api/v1/chat/conversations/{conv['id']}/", {"retention": "24h"}, format="json").json()
    assert upd["retention"] == "24h" and upd["can_change_retention"]
    assert p.get(f"/api/v1/chat/conversations/{conv['id']}/").json()["retention"] == "24h"

    temp = c.post(url, {"text": "на сутки"}, format="json").json()
    assert temp["expires_at"]
    texts = [m["text"] for m in p.get(url).json()["results"]]
    assert any("1 день" in t for t in texts)  # системное сообщение видно обоим

    # Через сутки: временные исчезают сразу из выдачи и физически после purge
    Message.objects.filter(expires_at__isnull=False).update(expires_at=timezone.now() - timedelta(seconds=1))
    assert [m["text"] for m in c.get(url).json()["results"]] == ["навсегда"]
    call_command("purge_chats", verbosity=0)
    assert not Message.objects.filter(pk=temp["id"]).exists()
    assert Message.objects.filter(pk=keep["id"]).exists()


@pytest.mark.django_db
def test_encryption_at_rest(pair, settings):
    c, p, conv = pair
    c.post(f"/api/v1/chat/conversations/{conv['id']}/messages/", {"text": "секретная фраза"}, format="json")
    raw = bytes(Message.objects.get(kind="text").text_enc)
    assert "секретная".encode() not in raw
    assert crypto.decrypt_text(raw) == "секретная фраза"

    token = crypto.encrypt_bytes(b"\x00\x01binary")
    assert crypto.decrypt_bytes(token) == b"\x00\x01binary"
    # Явный ключ + ротация: старый ключ остаётся вторым
    from cryptography.fernet import Fernet
    k1, k2 = Fernet.generate_key().decode(), Fernet.generate_key().decode()
    settings.CHAT_ENCRYPTION_KEY = k1
    old = crypto.encrypt_text("ротация")
    settings.CHAT_ENCRYPTION_KEY = f"{k2},{k1}"
    assert crypto.decrypt_text(old) == "ротация"
    settings.CHAT_ENCRYPTION_KEY = k2
    assert crypto.decrypt_text(old) == ""  # чужой ключ — без 500


@pytest.mark.django_db
def test_send_rate_limit(pair, settings):
    c, p, conv = pair
    settings.CHAT_SEND_RATE = "3/min"
    url = f"/api/v1/chat/conversations/{conv['id']}/messages/"
    codes = [c.post(url, {"text": str(i)}, format="json").status_code for i in range(4)]
    assert codes == [201, 201, 201, 429]


# ── WebSocket ─────────────────────────────────────────────────────────────────

@pytest.mark.django_db(transaction=True)
def test_ws_receives_new_message(client_user, psychologist):
    from config.asgi import application

    book(client_user, psychologist)
    c = auth_client(client_user)
    conv = open_chat(c, psychologist)
    p = auth_client(psychologist.user)
    token = p.post("/api/v1/chat/ws-token/").json()["token"]

    async def scenario():
        bad = WebsocketCommunicator(application, "/ws/chat/?token=forged")
        await bad.connect()
        assert (await bad.receive_output(timeout=2))["type"] == "websocket.close"

        ws = WebsocketCommunicator(application, f"/ws/chat/?token={token}")
        ok, _ = await ws.connect()
        assert ok
        assert json.loads(await ws.receive_from(timeout=2))["type"] == "ready"
        from asgiref.sync import sync_to_async
        await sync_to_async(c.post)(f"/api/v1/chat/conversations/{conv['id']}/messages/", {"text": "эй"},
                                    format="json")
        events = []
        for _ in range(3):
            events.append(json.loads(await ws.receive_from(timeout=2)))
            if events[-1]["type"] == "message.new":
                break
        new = events[-1]
        assert new["type"] == "message.new" and new["message"]["text"] == "эй" and new["message"]["mine"] is False
        await ws.disconnect()

    async_to_sync(scenario)()


# ── ИИ-помощник ───────────────────────────────────────────────────────────────

def _fake_stream(*chunks):
    async def gen(history):
        gen.history = history
        for ch in chunks:
            yield ch
    return gen


def _sse_events(resp):
    async def collect():
        return b"".join([chunk async for chunk in resp.streaming_content])

    body = async_to_sync(collect)().decode()
    return [json.loads(line[6:]) for line in body.split("\n") if line.startswith("data: ")]


@pytest.mark.django_db
def test_ai_unavailable_without_key(client_user, settings):
    settings.ANTHROPIC_API_KEY = ""
    c = auth_client(client_user)
    st = c.get("/api/v1/chat/ai/").json()
    assert st["enabled"] is False and st["name"] == "Тиша" and st["consent"] is False
    resp = c.post("/api/v1/chat/ai/reply/", {"text": "привет"}, format="json")
    assert resp.status_code == 503 and resp.json()["code"] == "ai_unavailable"


@pytest.mark.django_db
def test_ai_requires_consent_and_streams(client_user, psychologist, settings):
    settings.ANTHROPIC_API_KEY = "test-key"
    settings.AI_DAILY_LIMIT = 2
    c = auth_client(client_user)
    assert c.post("/api/v1/chat/ai/reply/", {"text": "привет"}, format="json").json()["code"] == "consent_required"
    # Специалисты Тишей не пользуются
    assert auth_client(psychologist.user).post("/api/v1/chat/ai/consent/").status_code == 403

    st = c.post("/api/v1/chat/ai/consent/").json()
    assert st["consent"] and st["conversation_id"]

    fake = _fake_stream("Слышу ", "тебя.")
    with mock.patch("apps.chat.ai.stream_reply", fake):
        resp = c.post("/api/v1/chat/ai/reply/", {"text": "Мне тревожно, пиши на a@b.ru или +7 999 123-45-67"},
                      format="json")
        assert resp["Content-Type"].startswith("text/event-stream")
        events = _sse_events(resp)
    assert [e["type"] for e in events] == ["user_message", "delta", "delta", "done"]
    assert events[-1]["message"]["text"] == "Слышу тебя." and events[-1]["message"]["sender_role"] == "ai"
    # Приветствие не уходит в API (история начинается с user), контакты скрыты
    assert fake.history[0]["role"] == "user"
    assert "a@b.ru" not in fake.history[0]["content"] and "999" not in fake.history[0]["content"]
    assert client_user.alias not in json.dumps(fake.history)

    msgs = c.get(f"/api/v1/chat/conversations/{st['conversation_id']}/messages/").json()["results"]
    assert [m["sender_role"] for m in msgs] == ["ai", "client", "ai"]
    # В AI-чат нельзя слать файлы/обычные сообщения
    assert c.post(f"/api/v1/chat/conversations/{st['conversation_id']}/messages/", {"text": "x"},
                  format="json").status_code == 400

    with mock.patch("apps.chat.ai.stream_reply", _fake_stream("ок")):
        assert c.post("/api/v1/chat/ai/reply/", {"text": "ещё"}, format="json").status_code == 200
        limited = c.post("/api/v1/chat/ai/reply/", {"text": "и ещё"}, format="json")
    assert limited.status_code == 429 and limited.json()["code"] == "ai_limit"
    assert AIDailyUsage.objects.get(user=client_user).count == 2


@pytest.mark.django_db
def test_ai_provider_error_refunds(client_user, settings):
    settings.ANTHROPIC_API_KEY = "test-key"
    c = auth_client(client_user)
    c.post("/api/v1/chat/ai/consent/")

    async def boom(history):
        raise RuntimeError("down")
        yield  # pragma: no cover

    with mock.patch("apps.chat.ai.stream_reply", boom):
        events = _sse_events(c.post("/api/v1/chat/ai/reply/", {"text": "привет"}, format="json"))
    assert events[-1]["type"] == "error"
    assert AIDailyUsage.objects.get(user=client_user).count == 0

    async def refuse(history):
        yield "частично"
        raise ai.AIRefusal()

    with mock.patch("apps.chat.ai.stream_reply", refuse):
        events = _sse_events(c.post("/api/v1/chat/ai/reply/", {"text": "привет"}, format="json"))
    assert [e["type"] for e in events][-2:] == ["replace", "done"]
    assert events[-1]["message"]["text"] == ai.REFUSAL_TEXT


def test_ai_history_builder():
    h = ai.build_history([("ai", "привет"), ("client", "а"), ("client", "б"), ("ai", "в")])
    assert h == [{"role": "user", "content": "а\n\nб"}, {"role": "assistant", "content": "в"}]


@pytest.mark.django_db
def test_ai_stream_reply_uses_sdk(settings):
    """stream_reply вызывает SDK с моделью из настроек и системным промптом (без сети)."""
    settings.ANTHROPIC_API_KEY = "k"
    settings.AI_MODEL = "claude-sonnet-5"

    class FakeStream:
        def __init__(self):
            async def gen():
                yield "привет"
            self.text_stream = gen()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get_final_message(self):
            return mock.Mock(stop_reason="end_turn")

    class FakeClient:
        calls = []

        def __init__(self, **kw):
            self.messages = self

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        def stream(self, **kw):
            FakeClient.calls.append(kw)
            return FakeStream()

    async def run():
        return [t async for t in ai.stream_reply([{"role": "user", "content": "hi"}])]

    with mock.patch("anthropic.AsyncAnthropic", FakeClient):
        assert async_to_sync(run)() == ["привет"]
    kw = FakeClient.calls[0]
    assert kw["model"] == "claude-sonnet-5" and "Тиша" in kw["system"] and "112" in kw["system"]
