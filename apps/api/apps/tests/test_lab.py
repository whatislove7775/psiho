"""Лаборатория персонала: тестовые комнаты — права, срок жизни, изоляция от статистики."""
from datetime import timedelta

import pytest
from asgiref.sync import async_to_sync
from channels.testing import WebsocketCommunicator
from django.core import signing
from django.utils import timezone
from rest_framework.test import APIClient

from apps.lab.models import TEST_ROOM_TTL, TestRoom
from apps.lab.tokens import LAB_TOKEN_SALT, make_lab_token, read_lab_token
from apps.sessions.models import ConsultationSession
from apps.signaling.tokens import validate_ws_token
from apps.staff.models import AuditLog, StaffMember
from apps.staff.roles import PERMISSIONS, ROLES, has_staff_perm
from apps.users.models import User

from .conftest import auth_client

ROOMS = "/api/v1/lab/rooms/"
JOIN = "/api/v1/lab/join/"


def make_staff(role):
    user = User.objects.create_user(alias=f"lab-{role}", password="staffpass12345", role="admin")
    StaffMember.objects.create(user=user, role=role)
    return user


@pytest.fixture
def owner(admin_user):
    return admin_user


# ── Права ─────────────────────────────────────────────────────────────

def test_lab_permission_in_matrix():
    assert PERMISSIONS["lab.use"] == frozenset({"owner", "admin", "developer"})


@pytest.mark.django_db
def test_lab_endpoints_follow_role_matrix(owner, client_user, psychologist):
    everyone = {r: make_staff(r) for r in ROLES if r != "owner"}
    everyone["owner"] = owner
    for role, user in everyone.items():
        c = auth_client(user)
        allowed = role in ("owner", "admin", "developer")
        assert has_staff_perm(user, "lab.use") is allowed
        assert ("lab.use" in c.get("/api/v1/staff/me/").json()["permissions"]) is allowed
        assert c.get(ROOMS).status_code == (200 if allowed else 403), role
        assert c.post(ROOMS, {}, format="json").status_code == (201 if allowed else 403), role
    for outsider in (client_user, psychologist.user):
        c = auth_client(outsider)
        assert c.get(ROOMS).status_code == 403
        assert c.post(ROOMS, {}, format="json").status_code == 403
    assert APIClient().get(ROOMS).status_code == 401
    assert APIClient().post(ROOMS, {}, format="json").status_code == 401


@pytest.mark.django_db
def test_create_join_and_close(owner):
    c = auth_client(owner)
    res = c.post(ROOMS, {"label": "Ноутбук + телефон", "client_avatar": {"v": 1}}, format="json")
    assert res.status_code == 201
    room = res.json()
    assert room["is_active"] and room["label"] == "Ноутбук + телефон"
    assert AuditLog.objects.filter(action="lab.room.create", target_id=room["id"]).exists()
    assert [r["id"] for r in c.get(ROOMS).json()["results"]] == [room["id"]]

    db_room = TestRoom.objects.get(pk=room["id"])
    expires = db_room.expires_at - db_room.created_at
    assert abs(expires - TEST_ROOM_TTL) < timedelta(seconds=5)

    anon = APIClient()
    # Вход без аккаунта; мусорный JWT в браузере не мешает
    anon.credentials(HTTP_AUTHORIZATION="Bearer expired.garbage.token")
    joined = {}
    for role in ("client", "psychologist"):
        r = anon.post(JOIN, {"token": room["tokens"][role]}, format="json")
        assert r.status_code == 200, r.content
        data = r.json()
        joined[role] = data
        assert data["role"] == role
        assert data["room_id"] == str(db_room.webrtc_room_id) != room["id"]
        claims = validate_ws_token(data["ws_token"], data["room_id"])
        assert claims and claims["role"] == role and claims["user_id"].startswith("lab:")
        # ws-токен не подходит ни к какой другой комнате
        assert validate_ws_token(data["ws_token"], room["id"]) is None
    assert joined["psychologist"]["peer"]["avatar_config"] == {"v": 1}
    assert joined["client"]["peer"]["name"] == "Тестовый специалист"

    # закрытие → ссылки перестают работать
    assert c.post(f"{ROOMS}{room['id']}/close/").status_code == 200
    assert anon.post(JOIN, {"token": room["tokens"]["client"]}, format="json").status_code == 410
    assert c.get(ROOMS).json()["results"] == []
    assert AuditLog.objects.filter(action="lab.room.close").count() == 1


@pytest.mark.django_db
def test_rooms_are_private_to_their_creator(owner):
    other = make_staff("developer")
    room = auth_client(owner).post(ROOMS, {}, format="json").json()
    oc = auth_client(other)
    assert oc.get(ROOMS).json()["results"] == []
    assert oc.post(f"{ROOMS}{room['id']}/close/").status_code == 404
    assert TestRoom.objects.get(pk=room["id"]).is_active


# ── Срок жизни и токены ───────────────────────────────────────────────

@pytest.mark.django_db
def test_room_expires_after_ttl(owner):
    c = auth_client(owner)
    room = c.post(ROOMS, {}, format="json").json()
    TestRoom.objects.filter(pk=room["id"]).update(expires_at=timezone.now() - timedelta(seconds=1))
    assert APIClient().post(JOIN, {"token": room["tokens"]["client"]}, format="json").status_code == 410
    assert c.get(ROOMS).json()["results"] == []
    # давно истёкшие комнаты удаляются при создании новой
    TestRoom.objects.filter(pk=room["id"]).update(expires_at=timezone.now() - timedelta(days=2))
    c.post(ROOMS, {}, format="json")
    assert not TestRoom.objects.filter(pk=room["id"]).exists()


@pytest.mark.django_db
def test_active_rooms_are_capped(owner):
    c = auth_client(owner)
    ids = [c.post(ROOMS, {}, format="json").json()["id"] for _ in range(7)]
    active = [r["id"] for r in c.get(ROOMS).json()["results"]]
    assert len(active) == 5 and ids[-1] in active and ids[0] not in active


@pytest.mark.django_db
def test_bad_and_foreign_tokens_rejected(owner, client_user, psychologist, settings):
    room = auth_client(owner).post(ROOMS, {}, format="json").json()
    anon = APIClient()
    for bad in (None, "", "garbage", room["tokens"]["client"] + "x", 123, "a" * 600):
        assert anon.post(JOIN, {"token": bad}, format="json").status_code == 403, bad
    # другая соль (например, ws-токен) не подходит
    forged = signing.dumps({"room": room["id"], "role": "client"}, salt="aprosop-ws")
    assert anon.post(JOIN, {"token": forged}, format="json").status_code == 403
    # неизвестная роль
    admin_role = signing.dumps({"room": room["id"], "role": "admin"}, salt=LAB_TOKEN_SALT)
    assert anon.post(JOIN, {"token": admin_role}, format="json").status_code == 403
    # токен тестовой комнаты не открывает настоящую сессию
    session = ConsultationSession.objects.create(
        client=client_user, psychologist_profile=psychologist, status="paid",
        scheduled_at=timezone.now(), duration_minutes=50, amount_kopecks=300000,
    )
    fake = make_lab_token(session.id, "client")
    assert anon.post(JOIN, {"token": fake}, format="json").status_code == 403
    # просроченная подпись
    settings.USE_TZ = True
    old = make_lab_token(room["id"], "client")
    assert read_lab_token(old) is not None
    from unittest import mock
    import time as _time
    with mock.patch("django.core.signing.time.time", return_value=_time.time() + TEST_ROOM_TTL.total_seconds() + 60):
        assert read_lab_token(old) is None


# ── Изоляция от статистики и списков ──────────────────────────────────

@pytest.mark.django_db
def test_test_rooms_do_not_touch_stats(owner, psychologist):
    c = auth_client(owner)
    before = c.get("/api/v1/staff/dashboard/").json()
    sessions_before = c.get("/api/v1/staff/sessions/").json()
    specialists_before = c.get("/api/v1/staff/specialists/").json()
    public_before = APIClient().get("/api/v1/psychologists/").json()
    for _ in range(3):
        room = c.post(ROOMS, {}, format="json").json()
        APIClient().post(JOIN, {"token": room["tokens"]["client"]}, format="json")
        APIClient().post(JOIN, {"token": room["tokens"]["psychologist"]}, format="json")
    after = c.get("/api/v1/staff/dashboard/").json()
    for key in ("users", "specialists", "sessions", "revenue", "series"):
        assert after[key] == before[key], key
    assert c.get("/api/v1/staff/sessions/").json() == sessions_before
    assert c.get("/api/v1/staff/specialists/").json() == specialists_before
    assert APIClient().get("/api/v1/psychologists/").json() == public_before
    assert ConsultationSession.objects.count() == 0
    # тестовые «участники» не создают аккаунтов
    assert User.objects.filter(role="client").count() == 0


# ── Сигналинг принимает токены тестовой комнаты ───────────────────────

@pytest.mark.django_db(transaction=True)
def test_signaling_accepts_lab_tokens(owner, settings):
    settings.CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
    room = auth_client(owner).post(ROOMS, {}, format="json").json()
    joins = {r: APIClient().post(JOIN, {"token": room["tokens"][r]}, format="json").json() for r in ("client", "psychologist")}

    async def scenario():
        from config.asgi import application

        def conn(role):
            j = joins[role]
            return WebsocketCommunicator(application, f"/ws/signaling/{j['room_id']}/?token={j['ws_token']}")

        client, psy = conn("client"), conn("psychologist")
        assert (await client.connect())[0]
        assert (await psy.connect())[0]
        assert await client.receive_json_from() == {"type": "peer-joined"}
        await psy.send_json_to({"type": "offer", "sdp": "x"})
        assert await client.receive_json_from() == {"type": "offer", "sdp": "x"}
        await client.disconnect()
        await psy.disconnect()

    async_to_sync(scenario)()
