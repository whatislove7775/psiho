from datetime import date, datetime, timedelta, timezone as dt_tz
from unittest import mock
from zoneinfo import ZoneInfo

import pytest
from django.utils import timezone

from apps.sessions.models import ConsultationSession
from apps.sessions.scheduling import compute_slots
from apps.signaling.tokens import validate_ws_token

from .conftest import auth_client

MSK = ZoneInfo("Europe/Moscow")


def msk(day: date, hour: int) -> datetime:
    return datetime(day.year, day.month, day.day, hour, tzinfo=MSK)


def iso(dt: datetime) -> str:
    return dt.astimezone(dt_tz.utc).isoformat().replace("+00:00", "Z")


@pytest.fixture
def day():
    return timezone.now().astimezone(MSK).date() + timedelta(days=3)


@pytest.mark.django_db
def test_schedule_put_then_slots(psychologist, api, day):
    p = auth_client(psychologist.user)
    bad = p.put("/api/v1/psychologist/schedule/", [{"weekday": 1, "start_time": "12:00", "end_time": "10:00"}], format="json")
    assert bad.status_code == 400
    overlap = p.put("/api/v1/psychologist/schedule/", [
        {"weekday": 1, "start_time": "10:00", "end_time": "12:00"},
        {"weekday": 1, "start_time": "11:00", "end_time": "13:00"},
    ], format="json")
    assert overlap.status_code == 400 and isinstance(overlap.json()["detail"], str)

    rules = [{"weekday": day.weekday(), "start_time": "10:00", "end_time": "13:00"}]
    resp = p.put("/api/v1/psychologist/schedule/", rules, format="json")
    assert resp.status_code == 200, resp.content
    assert resp.json() == rules
    assert p.get("/api/v1/psychologist/schedule/").json() == rules

    resp = api.get(f"/api/v1/psychologists/{psychologist.id}/slots/?from={day.isoformat()}&days=1")
    assert resp.status_code == 200
    # shortest duration (50 min) every 30 minutes (default start step): 10:00 … 12:00 MSK
    starts = [msk(day, 10) + timedelta(minutes=m) for m in (0, 30, 60, 90, 120)]
    assert resp.json() == [
        {"start": iso(x), "end": iso(x + timedelta(minutes=50))} for x in starts
    ]
    # other days of the week have no rules now
    resp = api.get(f"/api/v1/psychologists/{psychologist.id}/slots/?from={(day + timedelta(days=1)).isoformat()}&days=1")
    assert resp.json() == []


@pytest.mark.django_db
def test_slots_respect_lead_time_and_bookings(psychologist, client_user, day):
    ConsultationSession.objects.create(
        client=client_user, psychologist_profile=psychologist, scheduled_at=msk(day, 11),
        duration_minutes=80, amount_kopecks=1, status="paid",
    )
    ConsultationSession.objects.create(
        client=client_user, psychologist_profile=psychologist, scheduled_at=msk(day, 10),
        amount_kopecks=1, status="cancelled",
    )
    starts = [s for s, _ in compute_slots(psychologist, from_date=day, days=1)]
    # 11:00 busy, 12:00 overlaps with the 80-minute session (till 12:20)
    assert starts == [msk(day, 10)]

    # lead time: now = 09:30 MSK → 10:00 is too soon, the rest are busy
    now = msk(day, 9) + timedelta(minutes=30)
    assert [s for s, _ in compute_slots(psychologist, from_date=day, days=1, now=now)] == []


@pytest.mark.django_db
def test_public_list_and_detail(psychologist, api):
    resp = api.get("/api/v1/psychologists/")
    assert resp.status_code == 200
    item = resp.json()[0]
    assert item["id"] == psychologist.id and item["sessions_count"] == 0
    assert item["next_slot"] is not None and item["session_rate_rub"] == 3000
    assert set(item) == {
        "id", "display_name", "bio", "approach", "specializations", "languages", "experience_years",
        "session_rate_rub", "avatar_config", "photo_url", "sessions_count", "next_slot",
        "booking",
    }
    assert len(api.get("/api/v1/psychologists/?q=тревог").json()) == 1
    assert len(api.get("/api/v1/psychologists/?q=депрессия").json()) == 0
    assert len(api.get("/api/v1/psychologists/?specialization=отношения").json()) == 1
    assert len(api.get("/api/v1/psychologists/?max_rate=2000").json()) == 0
    assert api.get(f"/api/v1/psychologists/{psychologist.id}/").status_code == 200

    psychologist.verification_status = "pending"
    psychologist.save()
    assert api.get("/api/v1/psychologists/").json() == []
    assert api.get(f"/api/v1/psychologists/{psychologist.id}/").status_code == 404


@pytest.mark.django_db
def test_booking_flow_and_conflicts(psychologist, client_user, day):
    from apps.users.models import User

    c = auth_client(client_user)
    payload = {"psychologist_id": psychologist.id, "scheduled_at": iso(msk(day, 10)), "duration_minutes": 50}
    resp = c.post("/api/v1/sessions/book/", payload, format="json")
    assert resp.status_code == 201, resp.content
    s = resp.json()
    # оплата с анонимного баланса: денег нет → запись ждёт оплаты на /app/balance/pay/<id>
    assert s["status"] == "awaiting_payment" and s["payment_url"] == f"/app/balance/pay/{s['id']}"
    assert s["amount_rub"] == 3000 and s["duration_minutes"] == 50
    assert s["psychologist"] == {
        "id": psychologist.id, "display_name": "Анна", "avatar_config": None, "photo_url": None,
    }
    assert s["client"]["alias"] == client_user.alias
    assert s["can_join"] is False

    # same slot again by another client → conflict
    other = User.objects.create_anonymous_client("otherpass123")
    resp = auth_client(other).post("/api/v1/sessions/book/", payload, format="json")
    assert resp.status_code == 400 and "занято" in resp.json()["detail"]

    # outside schedule / misaligned / too soon
    for when in (msk(day, 14), msk(day, 10) + timedelta(minutes=30), timezone.now() + timedelta(minutes=20)):
        resp = auth_client(other).post("/api/v1/sessions/book/", {**payload, "scheduled_at": iso(when)}, format="json")
        assert resp.status_code == 400, when
    # 80 minutes at 12:00 exceeds window end 13:00
    resp = auth_client(other).post("/api/v1/sessions/book/", {**payload, "scheduled_at": iso(msk(day, 12)), "duration_minutes": 80}, format="json")
    assert resp.status_code == 400
    # 80 minutes at 11:00 fits (10:50 + 10 min buffer); price = 3600 ₽/h × 80/60
    resp = auth_client(other).post("/api/v1/sessions/book/", {**payload, "scheduled_at": iso(msk(day, 11)), "duration_minutes": 80}, format="json")
    assert resp.status_code == 201 and resp.json()["amount_rub"] == 4800
    # is_test free booking path is gone; invalid duration rejected
    resp = auth_client(other).post("/api/v1/sessions/book/", {**payload, "duration_minutes": 30, "is_test": True}, format="json")
    assert resp.status_code == 400

    # psychologists cannot book
    resp = auth_client(psychologist.user).post("/api/v1/sessions/book/", payload, format="json")
    assert resp.status_code == 403

    # list: role-aware
    assert len(c.get("/api/v1/sessions/").json()) == 1
    assert len(auth_client(psychologist.user).get("/api/v1/sessions/").json()) == 2

    # cancel frees the slot
    resp = c.post(f"/api/v1/sessions/{s['id']}/cancel/")
    assert resp.status_code == 200 and resp.json()["status"] == "cancelled"
    resp = auth_client(other).post("/api/v1/sessions/book/", payload, format="json")
    assert resp.status_code == 201


@pytest.mark.django_db
def test_legacy_yookassa_session_payment_webhook(psychologist, client_user, day, settings):
    """Старые платежи ЮKassa «на сессию» (до баланса) доводятся вебхуком до конца."""
    from apps.payments.models import Payment

    settings.YOOKASSA_SHOP_ID = "shop"
    settings.YOOKASSA_SECRET_KEY = "key"
    session = ConsultationSession(
        client=client_user, psychologist_profile=psychologist, scheduled_at=msk(day, 10),
        amount_kopecks=300000, status="awaiting_payment",
    )
    session.compute_split(20.0)
    session.save()
    Payment.objects.create(
        session=session, yookassa_payment_id="yk-123", amount_rub=3000, psychologist_payout_rub=2400,
        platform_fee_rub=600, confirmation_url="https://yoomoney.ru/checkout/xyz",
    )
    got = auth_client(client_user).get(f"/api/v1/sessions/{session.id}/").json()
    assert got["payment_url"] == "https://yoomoney.ru/checkout/xyz"

    # webhook body says succeeded, but API says canceled → API wins
    remote = mock.Mock(status="canceled", metadata={"session_id": str(session.id)})
    remote.amount.value = "3000.00"
    with mock.patch("apps.payments.services.YKPayment") as yk:
        yk.find_one.return_value = remote
        hook = auth_client(client_user).post("/api/v1/payments/webhook/", {
            "event": "payment.succeeded", "object": {"id": "yk-123", "status": "succeeded"},
        }, format="json")
    assert hook.status_code == 200
    session.refresh_from_db()
    assert session.status == "cancelled"


def _paid_session(client_user, psychologist, start):
    session = ConsultationSession(
        client=client_user, psychologist_profile=psychologist, scheduled_at=start,
        amount_kopecks=300000, status="paid",
    )
    session.compute_split(20.0)
    session.save()
    return session


@pytest.mark.django_db
def test_join_and_complete(client_user, psychologist):
    soon = _paid_session(client_user, psychologist, timezone.now() + timedelta(minutes=5))
    later = _paid_session(client_user, psychologist, timezone.now() + timedelta(hours=5))
    c = auth_client(client_user)
    p = auth_client(psychologist.user)

    assert c.get(f"/api/v1/sessions/{later.id}/").json()["can_join"] is False
    assert c.post(f"/api/v1/sessions/{later.id}/join/").status_code == 403
    assert c.get(f"/api/v1/sessions/{soon.id}/").json()["can_join"] is True

    resp = c.post(f"/api/v1/sessions/{soon.id}/join/")
    assert resp.status_code == 200, resp.content
    data = resp.json()
    assert data["role"] == "client" and data["room_id"] == str(soon.webrtc_room_id)
    assert data["peer"] == {"name": "Анна", "avatar_config": None, "photo_url": None}
    claims = validate_ws_token(data["ws_token"], data["room_id"])
    assert claims == {"user_id": str(client_user.id), "room_id": str(soon.webrtc_room_id), "role": "client"}
    soon.refresh_from_db()
    assert soon.status == "in_progress"
    assert soon.events.filter(event_type="participant_joined").count() == 1

    resp = p.post(f"/api/v1/sessions/{soon.id}/join/")
    assert resp.json()["role"] == "psychologist"
    assert resp.json()["peer"]["name"] == client_user.alias

    # cannot cancel once started; outsiders get 404
    assert c.post(f"/api/v1/sessions/{soon.id}/cancel/").status_code == 400
    from apps.users.models import User
    stranger = User.objects.create_anonymous_client("strangerpass1")
    assert auth_client(stranger).post(f"/api/v1/sessions/{soon.id}/join/").status_code == 404

    assert c.post(f"/api/v1/sessions/{later.id}/complete/").status_code == 400
    resp = p.post(f"/api/v1/sessions/{soon.id}/complete/")
    assert resp.status_code == 200 and resp.json()["status"] == "completed"

    stats = p.get("/api/v1/psychologist/stats/").json()
    assert stats["sessions_total"] == 1 and stats["upcoming"] == 1 and stats["clients_total"] == 1
    assert stats["earnings_total_rub"] == 2400  # 3000 − 20% комиссии
