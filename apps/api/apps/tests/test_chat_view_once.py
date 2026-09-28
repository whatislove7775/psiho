"""R9: вложения «Просмотр один раз» и «Исчезнет через …» (1 мин / 1 час / 1 день), подпись к файлу."""
import io
from datetime import timedelta

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.utils import timezone
from PIL import Image

from apps.chat.models import Attachment, Conversation, Message
from apps.sessions.models import ConsultationSession

from .conftest import auth_client
from .test_chat import PDF, book, open_chat

S = ConsultationSession.Status


def _url(conv):
    return f"/api/v1/chat/conversations/{conv['id']}/messages/"


def _png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (30, 20), (90, 140, 220)).save(buf, "PNG")
    return buf.getvalue()


def _image(**extra):
    return {"kind": "file", "file": SimpleUploadedFile("снимок.png", _png(), "image/png"), **extra}


@pytest.fixture
def pair(client_user, psychologist):
    book(client_user, psychologist, S.PAID)  # J2: файлы специалиста — после записи
    c = auth_client(client_user)
    conv = open_chat(c, psychologist)
    return c, auth_client(psychologist.user), conv


@pytest.mark.django_db
def test_caption_and_ttl(pair):
    c, p, conv = pair
    before = timezone.now()
    res = p.post(_url(conv), _image(text="Схема из сессии", ttl="1m"), format="multipart")
    assert res.status_code == 201, res.content
    body = res.json()
    assert body["text"] == "Схема из сессии" and body["view_once"] is False
    exp = Message.objects.get(pk=body["id"]).expires_at
    assert timedelta(seconds=55) < exp - before < timedelta(seconds=65)

    # Срок вложения не продлевает режим разговора: берётся меньший
    Conversation.objects.filter(pk=conv["id"]).update(retention="1h")
    res = p.post(_url(conv), _image(ttl="1d"), format="multipart")
    exp = Message.objects.get(pk=res.json()["id"]).expires_at
    assert exp - timezone.now() < timedelta(hours=1, minutes=1)

    assert p.post(_url(conv), _image(ttl="5y"), format="multipart").status_code == 400
    webm = SimpleUploadedFile("v.webm", b"\x1a\x45\xdf\xa3" + b"\x00" * 200, "audio/webm")
    assert c.post(_url(conv), {"kind": "voice", "file": webm, "duration_ms": 1000, "ttl": "1m"},
                  format="multipart").status_code == 400


@pytest.mark.django_db
def test_expired_attachment_is_gone_and_purged(pair):
    c, p, conv = pair
    mid = p.post(_url(conv), _image(ttl="1m"), format="multipart").json()["id"]
    assert c.get(f"/api/v1/chat/messages/{mid}/attachment/").status_code == 200
    Message.objects.filter(pk=mid).update(expires_at=timezone.now() - timedelta(seconds=1))
    assert c.get(f"/api/v1/chat/messages/{mid}/attachment/").status_code == 404
    assert all(m["id"] != mid for m in c.get(_url(conv)).json()["results"])
    call_command("purge_chats", verbosity=0)
    assert not Message.objects.filter(pk=mid).exists() and not Attachment.objects.filter(message_id=mid).exists()


@pytest.mark.django_db
def test_view_once_opens_once_for_recipient_only(pair):
    c, p, conv = pair
    res = p.post(_url(conv), _image(view_once="1", text="Только посмотреть"), format="multipart")
    assert res.status_code == 201, res.content
    sent = res.json()
    mid = sent["id"]
    # До открытия ни имени, ни подписи в API — только тип и размеры для заглушки
    assert sent["view_once"] is True and sent["viewed_at"] is None
    assert sent["attachment"]["name"] == "" and sent["text"] == ""
    assert sent["attachment"]["mime"] == "image/png"
    listed = next(m for m in c.get(_url(conv)).json()["results"] if m["id"] == mid)
    assert listed["attachment"]["name"] == "" and listed["text"] == ""
    assert c.get(f"/api/v1/chat/conversations/{conv['id']}/").json()["last_message"]["text"] == "Фото · один просмотр"
    # В списке файлов диалога такого файла нет
    dlg = c.get(f"/api/v1/dialogues/{conv['id']}/")
    assert dlg.status_code == 200 and all(f["message_id"] != mid for f in dlg.json()["files"])

    # Обычная выдача файла закрыта для обоих; отправитель не открывает
    assert c.get(f"/api/v1/chat/messages/{mid}/attachment/").status_code == 403
    assert p.get(f"/api/v1/chat/messages/{mid}/attachment/").status_code == 403
    assert p.post(f"/api/v1/chat/messages/{mid}/open/").status_code == 403

    opened = c.post(f"/api/v1/chat/messages/{mid}/open/")
    assert opened.status_code == 200 and opened["Content-Type"] == "image/png"
    assert opened.content.startswith(b"\x89PNG") and opened["Cache-Control"] == "private, no-store"
    from urllib.parse import unquote
    assert unquote(opened["X-File-Name"]) == "снимок.png" and unquote(opened["X-Caption"]) == "Только посмотреть"

    # Второй раз — нельзя; файл и подпись стёрты у обоих, осталась заглушка
    assert c.post(f"/api/v1/chat/messages/{mid}/open/").status_code == 410
    att = Attachment.objects.get(message_id=mid)
    msg = Message.objects.get(pk=mid)
    assert bytes(att.data_enc) == b""
    assert bytes(msg.text_enc) == b"" and msg.viewed_at is not None
    for who in (c, p):
        row = next(m for m in who.get(_url(conv)).json()["results"] if m["id"] == mid)
        assert row["viewed_at"] and row["attachment"]["name"] == ""
    assert c.get(f"/api/v1/chat/conversations/{conv['id']}/").json()["last_message"]["text"] == "Фото просмотрено"


@pytest.mark.django_db
def test_view_once_follows_file_rules(client_user, psychologist):
    # J2: без записи специалист файлов не отправляет — и «на один просмотр» тоже
    c = auth_client(client_user)
    conv = open_chat(c, psychologist)
    p = auth_client(psychologist.user)
    assert p.post(_url(conv), _image(view_once="1"), format="multipart").status_code == 403
    # Подпись проверяется на контакты до первого созвона
    book(client_user, psychologist, S.PAID)
    res = p.post(_url(conv), {"kind": "file", "file": SimpleUploadedFile("план.pdf", PDF, "application/pdf"),
                              "text": "пишите в телеграм @anna_psy"}, format="multipart")
    assert res.status_code == 422


@pytest.mark.django_db
def test_purge_wipes_leftover_view_once(pair):
    c, p, conv = pair
    mid = p.post(_url(conv), _image(view_once="1"), format="multipart").json()["id"]
    Message.objects.filter(pk=mid).update(viewed_at=timezone.now())  # как будто стирание прервалось
    call_command("purge_chats", verbosity=0)
    assert bytes(Attachment.objects.get(message_id=mid).data_enc) == b""
