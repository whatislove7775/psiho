"""Голосовые: расшифровка, сделанная на устройстве отправителя (web lib/captions).

Сервер звук не распознаёт — только хранит присланный текст как текст сообщения:
зашифрованным, удаляемым вместе с сообщением, не логируемым; контакты до первого
созвона в расшифровку не попадают (само голосовое при этом уходит).
"""
import logging

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.chat.models import Message

from .conftest import auth_client
from .test_chat import WEBM, pair  # noqa: F401  (fixture)


def _voice(c, conv, **extra):
    data = {"kind": "voice", "file": SimpleUploadedFile("v.webm", WEBM, "audio/webm"), "duration_ms": "2500", **extra}
    return c.post(f"/api/v1/chat/conversations/{conv['id']}/messages/", data, format="multipart")


@pytest.mark.django_db
def test_voice_transcript_stored_encrypted_and_shown_to_both(pair, caplog):  # noqa: F811
    c, p, conv = pair
    with caplog.at_level(logging.DEBUG):
        resp = _voice(c, conv, transcript="  мне   сегодня\nнамного лучше ")
    assert resp.status_code == 201, resp.content
    mid = resp.json()["id"]
    assert resp.json()["text"] == "мне сегодня намного лучше"
    raw = bytes(Message.objects.get(pk=mid).text_enc)
    assert "лучше".encode() not in raw  # at rest — encrypted
    assert "лучше" not in caplog.text  # never logged
    theirs = p.get(f"/api/v1/chat/conversations/{conv['id']}/messages/").json()["results"]
    assert [m["text"] for m in theirs if m["id"] == mid] == ["мне сегодня намного лучше"]


@pytest.mark.django_db
def test_voice_without_transcript_and_length_cap(pair):  # noqa: F811
    c, p, conv = pair
    assert _voice(c, conv).json()["text"] == ""
    long = _voice(c, conv, transcript="слово " * 2000).json()["text"]
    assert 0 < len(long) <= 4000


@pytest.mark.django_db
def test_voice_transcript_with_contacts_is_dropped_not_blocking(pair):  # noqa: F811
    c, p, conv = pair
    resp = _voice(c, conv, transcript="запишите мой номер +7 912 345-67-89")
    assert resp.status_code == 201
    assert resp.json()["text"] == ""


@pytest.mark.django_db
def test_voice_transcript_gone_with_message(pair):  # noqa: F811
    c, p, conv = pair
    mid = _voice(c, conv, transcript="личное").json()["id"]
    # чужие не видят
    from apps.users.models import User

    stranger = auth_client(User.objects.create_anonymous_client("strangerpass1"))
    assert stranger.get(f"/api/v1/chat/conversations/{conv['id']}/messages/").status_code in (403, 404)
    gone = c.post(f"/api/v1/chat/messages/{mid}/delete/", {"for": "all"}, format="json").json()
    assert gone["deleted"] is True and gone["text"] == ""
    assert bytes(Message.objects.get(pk=mid).text_enc) == b""
