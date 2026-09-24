from datetime import timedelta
from unittest import mock

import pytest
from asgiref.sync import async_to_sync
from channels.testing import WebsocketCommunicator
from django.core import signing

from apps.signaling.tokens import WS_TOKEN_SALT, make_ws_token, validate_ws_token
from apps.users.models import PsychologistProfile, User

from .conftest import auth_client

ROOM = "11111111-2222-3333-4444-555555555555"


@pytest.mark.django_db
def test_admin_verify_flow(admin_user, client_user, api):
    resp = api.post("/api/v1/auth/register/psychologist/", {
        "email": "new@example.com", "password": "newpsy12345", "display_name": "Ольга",
        "session_rate_rub": 2000,
    }, format="json")
    assert resp.status_code == 201
    profile = PsychologistProfile.objects.get(display_name="Ольга")

    assert auth_client(client_user).get("/api/v1/admin-panel/psychologists/").status_code == 403
    a = auth_client(admin_user)
    pending = a.get("/api/v1/admin-panel/psychologists/?status=pending").json()
    assert [p["id"] for p in pending] == [profile.id]
    assert pending[0]["verification_status"] == "pending" and "created_at" in pending[0]

    assert a.post(f"/api/v1/admin-panel/psychologists/{profile.id}/verify/", {"status": "bogus"}, format="json").status_code == 400
    resp = a.post(f"/api/v1/admin-panel/psychologists/{profile.id}/verify/", {"status": "approved"}, format="json")
    assert resp.status_code == 200 and resp.json()["verification_status"] == "approved"
    profile.refresh_from_db()
    assert profile.verified_by == admin_user and profile.verified_at

    assert a.get("/api/v1/admin-panel/psychologists/?status=pending").json() == []
    assert len(api.get("/api/v1/psychologists/").json()) == 1

    stats = a.get("/api/v1/admin-panel/stats/").json()
    assert stats == {
        "clients": 1, "psychologists": 1, "pending": 0,
        "sessions_today": 0, "sessions_month": 0, "revenue_month_rub": 0,
    }
    assert a.get("/api/v1/admin-panel/sessions/").json() == []


@pytest.mark.django_db
def test_psychologist_cabinet_profile(psychologist, client_user):
    p = auth_client(psychologist.user)
    resp = p.patch("/api/v1/psychologist/profile/", {
        "approach": "КПТ", "experience_years": 5, "session_rate_rub": 3500,
        "verification_status": "approved", "languages": ["русский", "английский"],
    }, format="json")
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert body["approach"] == "КПТ" and body["session_rate_rub"] == 3500
    assert body["languages"] == ["русский", "английский"]
    assert auth_client(client_user).get("/api/v1/psychologist/profile/").status_code == 403
    me = p.get("/api/v1/auth/me/").json()
    assert me["psychologist"]["experience_years"] == 5


def test_ws_token_validator():
    token = make_ws_token("u-1", ROOM, "client")
    assert validate_ws_token(token, ROOM) == {"user_id": "u-1", "room_id": ROOM, "role": "client"}
    assert validate_ws_token(token, "99999999-2222-3333-4444-555555555555") is None
    assert validate_ws_token(token + "x", ROOM) is None
    assert validate_ws_token("", ROOM) is None
    assert validate_ws_token(None, ROOM) is None
    # wrong salt
    forged = signing.dumps({"user_id": "u-1", "room_id": ROOM, "role": "client"}, salt="other")
    assert validate_ws_token(forged, ROOM) is None
    # invalid role
    bad_role = signing.dumps({"user_id": "u-1", "room_id": ROOM, "role": "admin"}, salt=WS_TOKEN_SALT)
    assert validate_ws_token(bad_role, ROOM) is None
    # expired (> 3h)
    import time
    with mock.patch("django.core.signing.time.time", return_value=time.time() - timedelta(hours=4).total_seconds()):
        old = make_ws_token("u-1", ROOM, "client")
    assert validate_ws_token(old, ROOM) is None


def _connect(token):
    from config.asgi import application

    path = f"/ws/signaling/{ROOM}/" + (f"?token={token}" if token else "")
    return WebsocketCommunicator(application, path)


def test_consumer_auth_and_relay(settings):
    settings.CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}

    async def scenario():
        bad = _connect("garbage")
        connected, _ = await bad.connect()
        assert connected
        closed = await bad.receive_output()
        assert closed == {"type": "websocket.close", "code": 4001}

        client = _connect(make_ws_token("c", ROOM, "client"))
        assert (await client.connect())[0]
        psy = _connect(make_ws_token("p", ROOM, "psychologist"))
        assert (await psy.connect())[0]
        assert await client.receive_json_from() == {"type": "peer-joined"}

        await client.send_json_to({"type": "offer", "sdp": "x"})
        assert await psy.receive_json_from() == {"type": "offer", "sdp": "x"}
        await client.send_json_to({"type": "evil"})
        assert await psy.receive_nothing()

        await psy.disconnect()
        assert await client.receive_json_from() == {"type": "peer-left"}
        await client.disconnect()

    async_to_sync(scenario)()
