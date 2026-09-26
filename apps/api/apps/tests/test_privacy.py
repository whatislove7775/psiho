"""Исчезающие сообщения (1 час / 1 день), защита от скриншотов, личные настройки /me/settings/."""
from datetime import timedelta

import pytest
from django.core.management import call_command
from django.utils import timezone

from apps.chat.models import Message
from apps.prefs.models import UserSettings

from .conftest import auth_client
from .test_chat import book, open_chat


@pytest.fixture
def pair(client_user, psychologist):
    book(client_user, psychologist)
    c = auth_client(client_user)
    return c, auth_client(psychologist.user), open_chat(c, psychologist)


def texts(client, conv):
    return [m["text"] for m in client.get(f"/api/v1/chat/conversations/{conv['id']}/messages/").json()["results"]]


@pytest.mark.django_db
def test_disappearing_one_hour(pair):
    c, p, conv = pair
    url = f"/api/v1/chat/conversations/{conv['id']}/messages/"
    old = c.post(url, {"text": "до включения"}, format="json").json()
    assert old["expires_at"] is None

    upd = c.patch(f"/api/v1/chat/conversations/{conv['id']}/", {"retention": "1h"}, format="json")
    assert upd.status_code == 200, upd.content
    assert upd.json()["retention"] == "1h"
    # Обе стороны видят системную отметку
    assert any("1 час" in t for t in texts(p, conv))
    assert any("1 час" in t for t in texts(c, conv))

    before = timezone.now()
    new = p.post(url, {"text": "исчезнет"}, format="json").json()
    exp = timezone.datetime.fromisoformat(new["expires_at"])
    assert timedelta(minutes=59) < exp - before <= timedelta(hours=1, seconds=5)
    # Старое сообщение режим не трогает (действует только для новых)
    assert Message.objects.get(pk=old["id"]).expires_at is None

    # Через час сообщение сразу пропадает из выдачи, даже если purge ещё не запускался
    Message.objects.filter(pk=new["id"]).update(expires_at=timezone.now() - timedelta(seconds=1))
    assert "исчезнет" not in texts(c, conv)
    assert "исчезнет" not in texts(p, conv)
    assert p.patch(f"/api/v1/chat/messages/{new['id']}/", {"text": "x"}, format="json").status_code == 404
    lst = c.get("/api/v1/chat/conversations/").json()
    item = next(x for x in (lst if isinstance(lst, list) else lst["results"]) if x["id"] == conv["id"])
    assert (item["last_message"] or {}).get("text") != "исчезнет"
    assert Message.objects.filter(pk=new["id"]).exists()
    call_command("purge_chats", verbosity=0)
    assert not Message.objects.filter(pk=new["id"]).exists()
    assert Message.objects.filter(pk=old["id"]).exists()


@pytest.mark.django_db
def test_disappearing_off_and_validation(pair):
    c, p, conv = pair
    base = f"/api/v1/chat/conversations/{conv['id']}/"
    assert c.patch(base, {"retention": "7d"}, format="json").status_code == 400
    assert p.patch(base, {"retention": "1h"}, format="json").status_code == 403
    c.patch(base, {"retention": "24h"}, format="json")
    msg = c.post(base + "messages/", {"text": "сутки"}, format="json").json()
    exp = timezone.datetime.fromisoformat(msg["expires_at"])
    assert timedelta(hours=23, minutes=59) < exp - timezone.now() <= timedelta(hours=24)
    c.patch(base, {"retention": "forever"}, format="json")
    assert c.post(base + "messages/", {"text": "навсегда"}, format="json").json()["expires_at"] is None
    assert any("выключены" in t for t in texts(p, conv))


@pytest.mark.django_db
def test_screen_protect_flag(pair):
    c, p, conv = pair
    base = f"/api/v1/chat/conversations/{conv['id']}/"
    assert c.get(base).json()["screen_protect"] is False
    assert p.patch(base, {"screen_protect": True}, format="json").status_code == 403
    assert c.patch(base, {"screen_protect": "yes"}, format="json").status_code == 400
    r = c.patch(base, {"screen_protect": True}, format="json")
    assert r.status_code == 200 and r.json()["screen_protect"] is True
    assert p.get(base).json()["screen_protect"] is True
    assert any("скриншот" in t for t in texts(p, conv))
    # Повтор не плодит системные сообщения
    n = Message.objects.filter(kind="system").count()
    c.patch(base, {"screen_protect": True}, format="json")
    assert Message.objects.filter(kind="system").count() == n


@pytest.mark.django_db
def test_my_settings(client_user, psychologist, api):
    url = "/api/v1/me/settings/"
    assert api.get(url).status_code == 401
    c = auth_client(client_user)
    assert c.get(url).json() == {"settings": {}, "updated_at": None}

    r = c.patch(url, {"stealth": {"enabled": True, "preset": "weather", "exit": "news", "wipe": True, "evil": 1},
                      "screen_protect": True, "v": 123, "other": "x"}, format="json")
    assert r.status_code == 200, r.content
    data = r.json()["settings"]
    assert data == {"stealth": {"enabled": True, "preset": "weather", "exit": "news", "wipe": True},
                    "screen_protect": True, "v": 123}
    # Частичное обновление сливается
    data = c.patch(url, {"stealth": {"enabled": False}}, format="json").json()["settings"]
    assert data["stealth"] == {"enabled": False, "preset": "weather", "exit": "news", "wipe": True}

    for bad in ({"stealth": {"preset": "casino"}}, {"stealth": {"exit": "https://evil"}},
                {"stealth": {"enabled": "1"}}, {"v": -1}, {"stealth": []}):
        assert c.patch(url, bad, format="json").status_code == 400, bad

    # Специалисту тоже доступно, и настройки у каждого свои
    s = auth_client(psychologist.user)
    assert s.get(url).json()["settings"] == {}
    s.patch(url, {"stealth": {"enabled": True}}, format="json")
    assert UserSettings.objects.count() == 2

    assert c.delete(url).status_code == 200
    assert c.get(url).json()["settings"] == {}
