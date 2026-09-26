"""«Круги»: публикация, места и лист ожидания, деньги, приватность, чат, групповой сигналинг."""
import json
from datetime import timedelta

import pytest
from asgiref.sync import async_to_sync
from channels.testing import WebsocketCommunicator
from django.utils import timezone

from apps.billing import services as B
from apps.billing.ledger import balance_of, verify
from apps.billing.models import Account, Hold
from apps.circles import services as svc
from apps.circles.models import Circle, CircleMessage, Meeting, Membership
from apps.signaling.group import make_group_token
from apps.staff.models import StaffMember
from apps.users.models import User

from .conftest import auth_client

K = Account.Kind


@pytest.fixture(autouse=True)
def _settings(settings):
    settings.PLATFORM_FEE_PERCENT = 20.0
    settings.BILLING_FREE_CANCEL_HOURS = 24
    settings.BILLING_LATE_CANCEL_PENALTY_PERCENT = 50
    settings.BILLING_MOCK_ENABLED = True
    settings.CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}


def credit(user, rub):
    B.adjust_client_balance(user, rub * 100, reason="тест", key=B.new_idempotency_key())


def clients(n, rub=10000):
    out = []
    for _ in range(n):
        u = User.objects.create_anonymous_client("clientpass123")
        if rub:
            credit(u, rub)
        out.append(u)
    return out


def payload(**over):
    data = {
        "topic": "anxiety", "title": "Тревога без стыда", "format": "series",
        "description": "Восемь недель про тревогу: разбираемся, откуда она берётся и что с ней делать вместе.",
        "rules": "", "meeting_minutes": 90, "capacity": 5, "billing": "per_meeting", "price_rub": 1000,
        "first_meeting_at": (timezone.now() + timedelta(days=3)).isoformat(), "meetings_count": 3,
    }
    data.update(over)
    return data


def published(psychologist, admin_user, **over) -> Circle:
    pro = auth_client(psychologist.user)
    r = pro.post("/api/v1/circles/pro/", payload(**over), format="json")
    assert r.status_code == 201, r.content
    cid = r.json()["id"]
    assert pro.post(f"/api/v1/circles/pro/{cid}/action/", {"action": "submit"}, format="json").status_code == 200
    staff = auth_client(admin_user)
    r = staff.post(f"/api/v1/staff/circles/{cid}/", {"decision": "approve"}, format="json")
    assert r.status_code == 200, r.content
    return Circle.objects.get(pk=cid)


@pytest.fixture
def admin_user(db):
    u = User.objects.create_superuser(alias="admin", password="adminpass12345")
    StaffMember.objects.get_or_create(user=u, defaults={"role": "owner"})
    return u


# ── Публикация ───────────────────────────────────────────────────────

@pytest.mark.django_db
def test_create_submit_review_flow(psychologist, admin_user, client_user):
    pro = auth_client(psychologist.user)
    r = pro.post("/api/v1/circles/pro/", payload(capacity=9), format="json")
    assert r.status_code == 400  # 5–8 мест
    r = pro.post("/api/v1/circles/pro/", payload(), format="json")
    cid = r.json()["id"]
    assert r.json()["status"] == "draft" and len(r.json()["meetings"]) == 3
    # черновик не виден в каталоге
    assert auth_client(client_user).get(f"/api/v1/circles/{cid}/").status_code == 404
    assert pro.post(f"/api/v1/circles/pro/{cid}/action/", {"action": "submit"}, format="json").json()["status"] == "pending"
    # клиент не может проверять
    assert auth_client(client_user).post(f"/api/v1/staff/circles/{cid}/", {"decision": "approve"}).status_code == 403
    staff = auth_client(admin_user)
    assert staff.get("/api/v1/staff/circles/").json()["counts"]["pending"] == 1
    r = staff.post(f"/api/v1/staff/circles/{cid}/", {"decision": "reject"}, format="json")
    assert r.status_code == 400  # нужен комментарий
    r = staff.post(f"/api/v1/staff/circles/{cid}/", {"decision": "reject", "comment": "Уточните правила"}, format="json")
    assert r.json()["status"] == "rejected"
    pro.post(f"/api/v1/circles/pro/{cid}/action/", {"action": "submit"}, format="json")
    r = staff.post(f"/api/v1/staff/circles/{cid}/", {"decision": "approve"}, format="json")
    assert r.json()["status"] == "recruiting"
    listing = auth_client(client_user).get("/api/v1/circles/?topic=anxiety").json()
    assert [c["id"] for c in listing["results"]] == [cid]
    assert listing["results"][0]["seats_left"] == 5


# ── Места, лист ожидания, деньги ─────────────────────────────────────

@pytest.mark.django_db
def test_capacity_waitlist_and_promotion(psychologist, admin_user):
    circle = published(psychologist, admin_user)
    users = clients(7)
    for u in users[:5]:
        r = auth_client(u).post(f"/api/v1/circles/{circle.id}/join/")
        assert r.status_code == 201 and r.json()["waitlisted"] is False
    # по встрече — 3 заморозки на каждого участника
    assert Hold.objects.filter(status="active").count() == 15
    assert balance_of(users[0], K.CLIENT) == 7000 * 100
    r = auth_client(users[5]).post(f"/api/v1/circles/{circle.id}/join/")
    assert r.json()["waitlisted"] is True
    auth_client(users[6]).post(f"/api/v1/circles/{circle.id}/join/")
    me = auth_client(users[6]).get(f"/api/v1/circles/{circle.id}/").json()["me"]
    assert me["status"] == "waitlist" and me["waitlist_position"] == 2
    assert balance_of(users[5], K.CLIENT) == 10000 * 100  # в листе ожидания деньги не замораживаются
    # участник выходит заранее → бесплатно; первый из листа ожидания становится участником и платит
    r = auth_client(users[0]).post(f"/api/v1/circles/{circle.id}/leave/")
    assert r.status_code == 200
    assert balance_of(users[0], K.CLIENT) == 10000 * 100
    assert Membership.objects.get(circle=circle, user=users[5]).status == "active"
    assert balance_of(users[5], K.CLIENT) == 7000 * 100
    assert svc.seats_taken(circle) == 5
    assert verify()["ok"]


@pytest.mark.django_db
def test_insufficient_funds_and_non_client(psychologist, admin_user):
    circle = published(psychologist, admin_user)
    poor = clients(1, rub=500)[0]
    r = auth_client(poor).post(f"/api/v1/circles/{circle.id}/join/")
    assert r.status_code == 402 and r.json()["code"] == "insufficient_funds"
    assert r.json()["shortfall_kopecks"] == 2500 * 100
    assert not Membership.objects.filter(user=poor).exists()  # всё откатилось
    assert balance_of(poor, K.CLIENT) == 500 * 100
    r = auth_client(psychologist.user).post(f"/api/v1/circles/{circle.id}/join/")
    assert r.status_code == 403


@pytest.mark.django_db
def test_late_leave_penalty_and_meeting_settlement(psychologist, admin_user):
    circle = published(psychologist, admin_user)
    u, v = clients(2)
    auth_client(u).post(f"/api/v1/circles/{circle.id}/join/")
    auth_client(v).post(f"/api/v1/circles/{circle.id}/join/")
    first = circle.meetings.order_by("starts_at").first()
    # первая встреча через 12 часов → выход «поздний»: штраф 50 % за неё, остальные — бесплатно
    Meeting.objects.filter(pk=first.pk).update(starts_at=timezone.now() + timedelta(hours=12))
    Hold.objects.filter(scheduled_at=first.starts_at).update(scheduled_at=timezone.now() + timedelta(hours=12))
    terms = auth_client(u).get(f"/api/v1/circles/{circle.id}/").json()["me"]["leave_terms"]
    assert terms == {"refund_kopecks": 2500 * 100, "penalty_kopecks": 500 * 100, "kept_kopecks": 0}
    auth_client(u).post(f"/api/v1/circles/{circle.id}/leave/")
    assert balance_of(u, K.CLIENT) == 9500 * 100
    # встреча прошла с ведущим → списание у оставшегося; следующая без ведущего → возврат
    first.refresh_from_db()
    Meeting.objects.filter(pk=first.pk).update(starts_at=timezone.now() - timedelta(hours=3), host_joined_at=timezone.now())
    second = circle.meetings.order_by("starts_at")[1]
    Meeting.objects.filter(pk=second.pk).update(starts_at=timezone.now() - timedelta(hours=2, minutes=1))
    res = svc.sweep()
    assert res["meetings_settled"] == 2
    assert Meeting.objects.get(pk=first.pk).status == "done"
    assert Meeting.objects.get(pk=second.pk).status == "missed"
    held = balance_of(v, K.CLIENT_HOLD)
    assert held == 1000 * 100  # осталась только третья встреча
    assert balance_of(v, K.CLIENT) == 8000 * 100  # 10000 − 3000 + 1000 возврат за несостоявшуюся
    assert balance_of(psychologist.user, K.SPEC_PENDING) == 800 * 100 + 400 * 100  # встреча v + штраф u (минус 20 %)
    assert verify()["ok"]


@pytest.mark.django_db
def test_series_billing_captured_after_first_meeting(psychologist, admin_user):
    circle = published(psychologist, admin_user, billing="series", price_rub=2400)
    u = clients(1)[0]
    auth_client(u).post(f"/api/v1/circles/{circle.id}/join/")
    assert Hold.objects.filter(client=u).count() == 1 and balance_of(u, K.CLIENT_HOLD) == 2400 * 100
    first = circle.meetings.order_by("starts_at").first()
    Meeting.objects.filter(pk=first.pk).update(starts_at=timezone.now() - timedelta(hours=3), host_joined_at=timezone.now())
    svc.sweep()
    assert Hold.objects.get(client=u).status == "captured"
    circle.refresh_from_db()
    assert circle.status == "running"
    # цикл начался — записаться больше нельзя
    late = clients(1)[0]
    assert auth_client(late).post(f"/api/v1/circles/{circle.id}/join/").status_code == 400


@pytest.mark.django_db
def test_cancel_circle_refunds_everyone(psychologist, admin_user):
    circle = published(psychologist, admin_user)
    u = clients(1)[0]
    auth_client(u).post(f"/api/v1/circles/{circle.id}/join/")
    r = auth_client(psychologist.user).post(f"/api/v1/circles/pro/{circle.id}/action/", {"action": "cancel"}, format="json")
    assert r.json()["status"] == "cancelled"
    assert balance_of(u, K.CLIENT) == 10000 * 100 and balance_of(u, K.CLIENT_HOLD) == 0


# ── Приватность ──────────────────────────────────────────────────────

@pytest.mark.django_db
def test_participants_never_see_real_alias_or_ids(psychologist, admin_user):
    circle = published(psychologist, admin_user)
    a, b = clients(2)
    auth_client(a).post(f"/api/v1/circles/{circle.id}/join/")
    auth_client(b).post(f"/api/v1/circles/{circle.id}/join/")
    auth_client(a).post(f"/api/v1/circles/{circle.id}/messages/", {"text": "Привет всем"}, format="json")
    names = set(Membership.objects.filter(circle=circle).values_list("pseudonym", flat=True))
    assert all(n.startswith("Участник-") for n in names) and len(names) == 2

    secrets = [a.alias, b.alias, str(a.id), str(b.id), a.alias.split("-")[0]]
    for viewer in (a, b, psychologist.user):
        c = auth_client(viewer)
        blobs = [
            c.get(f"/api/v1/circles/{circle.id}/").content.decode(),
            c.get(f"/api/v1/circles/{circle.id}/members/").content.decode(),
            c.get(f"/api/v1/circles/{circle.id}/messages/").content.decode(),
        ]
        if viewer == psychologist.user:
            blobs.append(c.get(f"/api/v1/circles/pro/{circle.id}/").content.decode())
        for blob in blobs:
            for s in secrets:
                if viewer in (a, b) and s in (viewer.alias, str(viewer.id)):
                    continue
                assert s not in blob, (s, blob[:300])
    msgs = auth_client(b).get(f"/api/v1/circles/{circle.id}/messages/").json()["results"]
    mine = [m for m in msgs if m["author"]["kind"] == "member"]
    assert mine[0]["author"]["name"].startswith("Участник-") and mine[0]["mine"] is False
    # псевдоним в разных кругах — разный (не связывает человека между кругами)
    other = published(psychologist, admin_user, title="Выгорание на работе", topic="burnout")
    auth_client(a).post(f"/api/v1/circles/{other.id}/join/")
    h1 = Membership.objects.get(circle=circle, user=a).handle
    h2 = Membership.objects.get(circle=other, user=a).handle
    assert h1 != h2
    # посторонний не видит участников и чат
    stranger = clients(1)[0]
    assert auth_client(stranger).get(f"/api/v1/circles/{circle.id}/members/").status_code == 403
    assert auth_client(stranger).get(f"/api/v1/circles/{circle.id}/messages/").status_code == 403


@pytest.mark.django_db
def test_host_moderation_and_disappearing_chat(psychologist, admin_user):
    circle = published(psychologist, admin_user, chat_retention="1h")
    a, b = clients(2)
    auth_client(a).post(f"/api/v1/circles/{circle.id}/join/")
    auth_client(b).post(f"/api/v1/circles/{circle.id}/join/")
    pro = auth_client(psychologist.user)
    ha = Membership.objects.get(circle=circle, user=a).handle
    assert pro.post(f"/api/v1/circles/pro/{circle.id}/members/{ha}/", {"action": "mute"}, format="json").status_code == 200
    r = auth_client(a).post(f"/api/v1/circles/{circle.id}/messages/", {"text": "эй"}, format="json")
    assert r.status_code == 403 and r.json()["code"] == "muted"
    r = auth_client(b).post(f"/api/v1/circles/{circle.id}/messages/", {"text": "тихо тут"}, format="json")
    assert r.status_code == 201 and r.json()["expires_at"]
    # участник не может модерировать
    assert auth_client(b).post(f"/api/v1/circles/pro/{circle.id}/members/{ha}/", {"action": "remove"}).status_code == 403
    pro.post(f"/api/v1/circles/pro/{circle.id}/members/{ha}/", {"action": "remove"}, format="json")
    assert Membership.objects.get(circle=circle, user=a).status == "removed"
    assert balance_of(a, K.CLIENT) == 10000 * 100  # исключение — полный возврат
    assert auth_client(a).post(f"/api/v1/circles/{circle.id}/join/").status_code == 403
    CircleMessage.objects.update(expires_at=timezone.now() - timedelta(minutes=1))
    assert auth_client(b).get(f"/api/v1/circles/{circle.id}/messages/").json()["results"] == []
    assert svc.purge_messages() >= 1


# ── Групповая комната ────────────────────────────────────────────────

def _ws(room, token):
    from config.asgi import application

    return WebsocketCommunicator(application, f"/ws/circle/{room}/?token={token}")


@pytest.mark.django_db(transaction=True)
def test_group_signaling_three_peers(psychologist, admin_user):
    circle = published(psychologist, admin_user)
    a, b = clients(2)
    auth_client(a).post(f"/api/v1/circles/{circle.id}/join/")
    auth_client(b).post(f"/api/v1/circles/{circle.id}/join/")
    meeting = circle.meetings.order_by("starts_at").first()
    Meeting.objects.filter(pk=meeting.pk).update(starts_at=timezone.now() + timedelta(minutes=5))
    # закрытая комната (за день до встречи) — нельзя
    later = circle.meetings.order_by("starts_at")[1]
    assert auth_client(a).post(f"/api/v1/circles/meetings/{later.id}/join/").status_code == 409
    joins = {}
    for who in (psychologist.user, a, b):
        r = auth_client(who).post(f"/api/v1/circles/meetings/{meeting.id}/join/")
        assert r.status_code == 200, r.content
        joins[who.pk] = r.json()
        assert str(who.id) not in json.dumps(r.json())
    host, ja, jb = joins[psychologist.user.pk], joins[a.pk], joins[b.pk]
    assert host["self"]["id"] == "host" and ja["self"]["name"].startswith("Участник-")
    room = host["room_id"]
    stranger_token = make_group_token(user_id=b.id, room_id=room, peer=ja["self"]["id"], role="member",
                                      circle_id=circle.id, meeting_id=meeting.id)

    async def scenario():
        bad = _ws(room, stranger_token)  # чужой handle с токеном другого пользователя
        await bad.connect()
        assert (await bad.receive_output())["code"] == 4001

        h = _ws(room, host["ws_token"])
        await h.connect()
        w = await h.receive_json_from()
        assert w["type"] == "welcome" and w["peers"] == [] and w["role"] == "host"
        pa = _ws(room, ja["ws_token"])
        await pa.connect()
        w = await pa.receive_json_from()
        assert [p["id"] for p in w["peers"]] == ["host"]
        j = await h.receive_json_from()
        assert j["type"] == "peer-joined" and j["peer"]["id"] == ja["self"]["id"]
        assert j["peer"]["name"] == ja["self"]["name"] and "alias" not in json.dumps(j)
        pb = _ws(room, jb["ws_token"])
        await pb.connect()
        w = await pb.receive_json_from()
        assert sorted(p["id"] for p in w["peers"]) == sorted(["host", ja["self"]["id"]])
        await h.receive_json_from()
        await pa.receive_json_from()
        # адресный сигнал: доходит только адресату
        await pb.send_json_to({"type": "signal", "to": ja["self"]["id"], "data": {"description": {"type": "offer", "sdp": "x"}}})
        got = await pa.receive_json_from()
        assert got == {"type": "signal", "from": jb["self"]["id"], "data": {"description": {"type": "offer", "sdp": "x"}}}
        assert await h.receive_nothing()
        # поднять руку — видят все; участник не может «выключить всех»
        await pa.send_json_to({"type": "state", "hand": True, "face": "real"})
        st = await h.receive_json_from()
        assert st["type"] == "peer-state" and st["state"]["hand"] is True and st["state"]["face"] == "avatar"
        await pb.receive_json_from()
        await pa.send_json_to({"type": "mute-all"})
        assert await pb.receive_nothing()
        await h.send_json_to({"type": "mute-all"})
        assert (await pa.receive_json_from())["type"] == "mute-request"
        assert (await pb.receive_json_from())["type"] == "mute-request"
        assert await h.receive_nothing()
        # ведущий удаляет участника: его выкидывает, остальные видят уход
        await h.send_json_to({"type": "remove", "peer": jb["self"]["id"]})
        assert (await pb.receive_json_from())["type"] == "removed"
        left = await pa.receive_json_from()
        assert left == {"type": "peer-left", "id": jb["self"]["id"]}
        # ведущий завершает встречу
        await h.send_json_to({"type": "end"})
        assert (await pa.receive_json_from())["type"] == "ended"
        for c in (h, pa, pb):
            await c.disconnect()

    async_to_sync(scenario)()
    assert Membership.objects.get(circle=circle, user=b).status == "removed"
    meeting.refresh_from_db()
    assert meeting.status == "done" and meeting.settled
