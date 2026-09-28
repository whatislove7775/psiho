"""👍/👎 reactions in circles: relayed to the peers of the same room only, kind sanitised, rate-limited."""
from datetime import timedelta

import pytest
from asgiref.sync import async_to_sync
from django.utils import timezone

from apps.circles.models import Meeting

from .conftest import auth_client
from .test_circles import _ws, clients, published


@pytest.fixture(autouse=True)
def _settings(settings):
    settings.PLATFORM_FEE_PERCENT = 20.0
    settings.BILLING_FREE_CANCEL_HOURS = 24
    settings.BILLING_LATE_CANCEL_PENALTY_PERCENT = 50
    settings.BILLING_MOCK_ENABLED = True
    settings.CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}


@pytest.mark.django_db(transaction=True)
def test_group_reactions(psychologist, admin_user):
    circle = published(psychologist, admin_user)
    (a,) = clients(1)
    auth_client(a).post(f"/api/v1/circles/{circle.id}/join/")
    meeting = circle.meetings.order_by("starts_at").first()
    Meeting.objects.filter(pk=meeting.pk).update(starts_at=timezone.now() + timedelta(minutes=5))
    host = auth_client(psychologist.user).post(f"/api/v1/circles/meetings/{meeting.id}/join/").json()
    ja = auth_client(a).post(f"/api/v1/circles/meetings/{meeting.id}/join/").json()
    room = host["room_id"]

    async def scenario():
        h = _ws(room, host["ws_token"])
        await h.connect()
        await h.receive_json_from()  # welcome
        pa = _ws(room, ja["ws_token"])
        await pa.connect()
        await pa.receive_json_from()  # welcome
        await h.receive_json_from()  # peer-joined

        await pa.send_json_to({"type": "reaction", "kind": "up", "junk": 1})
        assert await h.receive_json_from() == {"type": "reaction", "id": ja["self"]["id"], "kind": "up"}
        assert await pa.receive_nothing()  # not echoed to the sender
        await pa.send_json_to({"type": "reaction", "kind": "down"})  # too soon: dropped
        await h.send_json_to({"type": "reaction", "kind": "<script>"})
        assert await h.receive_nothing()
        assert await pa.receive_nothing()
        await h.disconnect()
        await pa.disconnect()

    async_to_sync(scenario)()
