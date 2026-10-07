"""Couples bookings: access boundaries, single payment, invitations, calendars and cancellation."""
from datetime import timedelta
import pytest
from django.utils import timezone
from apps.availability import services as availability
from apps.billing import services as billing
from apps.billing.models import Account, Hold
from apps.billing.ledger import balance_of, InsufficientFunds
from apps.circles import couples, services as circles
from apps.circles.models import Circle, Charge, Membership
from apps.sessions.models import ConsultationSession
from apps.users.models import User
from .conftest import auth_client

pytestmark = pytest.mark.django_db

@pytest.fixture
def setup_pair(psychologist, client_user, settings):
    settings.CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
    settings.BILLING_FREE_CANCEL_HOURS = 24
    settings.BILLING_LATE_CANCEL_PENALTY_PERCENT = 50
    a = availability.get_settings(psychologist)
    a.couples_enabled = True
    a.couples_minutes = 80
    a.couples_price_rub = 5000
    a.save()
    billing.adjust_client_balance(client_user, 1000000, reason="test", key=billing.new_idempotency_key())
    day = availability.local_today(psychologist) + timedelta(days=3)
    start = availability.starts_for(psychologist, 80, day, day, couples=True)[0]
    return psychologist, client_user, start


def other():
    return User.objects.create_anonymous_client("testpassword123")


def test_private_booking_single_payment_and_room(setup_pair, api):
    psy, payer, start = setup_pair
    circle = couples.book(payer, psy.pk, start)
    token = couples.invite(circle, payer)
    partner = other()
    assert api.get("/api/v1/circles/").json()["results"] == []
    outsider = auth_client(other())
    assert outsider.get(f"/api/v1/circles/{circle.id}/").status_code == 404
    assert outsider.post(f"/api/v1/circles/{circle.id}/join/").status_code == 404
    assert outsider.get(f"/api/v1/circles/{circle.id}/messages/").status_code == 403
    assert outsider.get(f"/api/v1/circles/{circle.id}/members/").status_code == 403
    preview = auth_client(partner).post("/api/v1/circles/couples/invitation/preview/", {"token":token}, format="json")
    assert preview.status_code == 200
    assert set(preview.json()) == {"host","starts_at","minutes","paid"}
    client = auth_client(partner)
    assert client.post("/api/v1/circles/couples/invitation/accept/", {"token":token}, format="json").status_code == 400
    accepted = client.post("/api/v1/circles/couples/invitation/accept/", {"token":token,"consent":True}, format="json")
    assert accepted.status_code == 201, accepted.content
    assert Charge.objects.filter(membership__circle=circle).count() == 1
    assert Hold.objects.get(session_ref=Charge.objects.get(membership__circle=circle).ref).amount_kopecks == 500000
    assert balance_of(partner,Account.Kind.CLIENT) == 0
    assert accepted.json()["seats_taken"] == 2
    assert client.get(f"/api/v1/circles/{circle.id}/").status_code == 200
    assert client.get("/api/v1/circles/mine/?session_format=couple").json()["results"][0]["id"] == str(circle.id)
    assert client.get("/api/v1/circles/mine/").json()["results"] == []
    assert auth_client(psy.user).get("/api/v1/circles/pro/?session_format=couple").json()["results"][0]["kind"] == "couple"
    assert outsider.post(f"/api/v1/circles/meetings/{circle.meetings.first().id}/join/").status_code == 403
    assert client.post("/api/v1/circles/couples/invitation/accept/", {"token":token,"consent":True}, format="json").status_code == 404
    assert str(payer.id) not in str(accepted.json())


def test_invite_rotation_own_account_and_replay(setup_pair):
    psy,payer,start=setup_pair
    c=couples.book(payer,psy.pk,start)
    old=couples.invite(c,payer);new=couples.invite(c,payer)
    with pytest.raises(circles.CircleError):couples.invitation(old)
    with pytest.raises(circles.CircleError):couples.accept(payer,new)
    with pytest.raises(circles.CircleError):couples.invite(c,other())
    couples.accept(other(),new)
    with pytest.raises(circles.CircleError):couples.accept(other(),new)
    with pytest.raises(circles.CircleError):couples.invite(c,payer)
    c.refresh_from_db();assert c.partner_invite_hash == ""


def test_no_funds_no_orphan_booking_and_disabled(setup_pair):
    psy,payer,start=setup_pair
    with pytest.raises(InsufficientFunds):couples.book(other(),psy.pk,start)
    assert Circle.objects.count()==0
    a=availability.get_settings(psy);a.couples_enabled=False;a.save()
    with pytest.raises(circles.CircleError):couples.book(payer,psy.pk,start)
    assert Circle.objects.count()==0


def test_booking_blocks_individual_and_other_pair(setup_pair):
    psy,payer,start=setup_pair
    c=couples.book(payer,psy.pk,start)
    day=start.astimezone(availability.safe_zone(availability.get_settings(psy).time_zone)).date()
    assert start not in availability.starts_for(psy,50,day,day)
    with pytest.raises(circles.CircleError):couples.book(other(),psy.pk,start)
    assert Circle.objects.count()==1
    assert availability.check_bookable(psy,start,50,client=payer) is not None
    couples.cancel(c,payer)
    assert start in availability.starts_for(psy,50,day,day)


def test_partner_can_cancel_both_and_refund_once(setup_pair):
    psy,payer,start=setup_pair;c=couples.book(payer,psy.pk,start)
    partner=other();token=couples.invite(c,payer);couples.accept(partner,token)
    with pytest.raises(circles.CircleError):couples.cancel(c,other())
    couples.cancel(c,partner);couples.cancel(c,partner)
    assert balance_of(payer,Account.Kind.CLIENT)==1000000
    assert balance_of(partner,Account.Kind.CLIENT)==0
    assert c.meetings.get().status=="cancelled"
    with pytest.raises(circles.CircleError):couples.invitation(token)


def test_late_cancel_uses_payer_penalty(setup_pair,monkeypatch):
    psy,payer,start=setup_pair;c=couples.book(payer,psy.pk,start)
    monkeypatch.setattr(timezone,"now",lambda:start-timedelta(hours=2))
    couples.cancel(c,payer)
    hold=Hold.objects.get(session_ref=Charge.objects.get(membership__circle=c).ref)
    assert hold.returned_kopecks==250000
    assert balance_of(payer,Account.Kind.CLIENT)==750000


def test_host_no_show_and_completion_settle_once(setup_pair,monkeypatch):
    psy,payer,start=setup_pair;c=couples.book(payer,psy.pk,start);m=c.meetings.get()
    assert circles.settle_meeting(m,force=True)
    assert balance_of(payer,Account.Kind.CLIENT)==1000000
    assert not circles.settle_meeting(m,force=True)
    # Fresh later booking, host joined => same standard ledger settlement.
    day=start.date()+timedelta(days=1)
    next_start=availability.starts_for(psy,80,day,day,couples=True)[0]
    c=couples.book(payer,psy.pk,next_start);m=c.meetings.get()
    circles.mark_host_joined(m);circles.end_meeting(m)
    h=Hold.objects.get(session_ref=Charge.objects.get(membership__circle=c).ref)
    assert h.status==Hold.Status.CAPTURED
    assert not circles.settle_meeting(m,force=True)


def test_invitation_expires_and_partner_conflict(setup_pair,monkeypatch):
    psy,payer,start=setup_pair;c=couples.book(payer,psy.pk,start);token=couples.invite(c,payer)
    monkeypatch.setattr(timezone,"now",lambda:start+timedelta(seconds=1))
    with pytest.raises(circles.CircleError):couples.invitation(token)


def test_partner_calendar_conflict_keeps_invitation(setup_pair):
    psy, payer, start = setup_pair
    pair = couples.book(payer, psy.pk, start)
    token = couples.invite(pair, payer)
    partner = other()
    ConsultationSession.objects.create(client=partner, psychologist_profile=psy,
        scheduled_at=start, duration_minutes=50, amount_kopecks=250000, status="paid")
    with pytest.raises(circles.CircleError) as error:
        couples.accept(partner, token)
    assert error.value.code == "conflict"
    assert pair.memberships.count() == 1
    assert couples.invitation(token).pk == pair.pk


@pytest.mark.django_db(transaction=True)
def test_private_couple_three_peer_room(setup_pair):
    from asgiref.sync import async_to_sync
    from apps.circles.models import Meeting
    from .test_circles import _ws

    psy, payer, start = setup_pair
    pair = couples.book(payer, psy.pk, start)
    partner = other()
    couples.accept(partner, couples.invite(pair, payer))
    meeting = pair.meetings.first()
    Meeting.objects.filter(pk=meeting.pk).update(starts_at=timezone.now() + timedelta(minutes=5))
    joins = []
    for user in (psy.user, payer, partner):
        response = auth_client(user).post(f"/api/v1/circles/meetings/{meeting.pk}/join/")
        assert response.status_code == 200
        assert response.json()["circle"]["kind"] == "couple"
        joins.append(response.json())
    assert auth_client(other()).post(f"/api/v1/circles/meetings/{meeting.pk}/join/").status_code == 403

    async def scenario():
        peers = []
        for i, info in enumerate(joins):
            ws = _ws(info["room_id"], info["ws_token"])
            await ws.connect()
            welcome = await ws.receive_json_from()
            assert len(welcome["peers"]) == i
            for previous in peers:
                assert (await previous.receive_json_from())["type"] == "peer-joined"
            peers.append(ws)
        host, a, b = peers
        await b.send_json_to({"type": "signal", "to": joins[1]["self"]["id"],
            "data": {"description": {"type": "offer", "sdp": "test"}}})
        assert (await a.receive_json_from())["from"] == joins[2]["self"]["id"]
        assert await host.receive_nothing()
        await host.send_json_to({"type": "end"})
        assert (await a.receive_json_from())["type"] == "ended"
        assert (await b.receive_json_from())["type"] == "ended"
        for ws in peers:
            await ws.disconnect()

    async_to_sync(scenario)()
    meeting.refresh_from_db()
    assert meeting.status == "done" and meeting.settled
    assert Charge.objects.filter(membership__circle=pair).count() == 1


@pytest.mark.parametrize("price,minutes", [(6000,80),(5000,90)])
def test_changed_quote_does_not_charge_or_book(setup_pair, price, minutes):
    psy,payer,start=setup_pair
    response=auth_client(payer).post("/api/v1/circles/couples/book/",{
        "psychologist_id":psy.pk,"scheduled_at":start.isoformat(),
        "expected_price_rub":price,"expected_minutes":minutes},format="json")
    assert response.status_code==409
    assert response.json()["code"]=="quote_changed"
    assert Circle.objects.count()==0
    assert balance_of(payer,Account.Kind.CLIENT)==1000000


def test_couple_booking_api_price_contract(setup_pair):
    psy,payer,start=setup_pair
    response=auth_client(payer).post("/api/v1/circles/couples/book/",{
        "psychologist_id":psy.pk,"scheduled_at":start.isoformat(),
        "expected_price_rub":5000,"expected_minutes":80},format="json")
    assert response.status_code==201
    assert response.json()["price_kopecks"]==500000
    assert response.json()["kind"]=="couple"
