import pytest
from django.utils import timezone

from apps.calls.models import CallFeedback
from apps.sessions.models import ConsultationSession
from apps.users.models import User

from .conftest import auth_client


@pytest.fixture
def call(client_user, psychologist):
    return ConsultationSession.objects.create(
        client=client_user, psychologist_profile=psychologist, scheduled_at=timezone.now(),
        amount_kopecks=1, status="paid",
    )


@pytest.mark.django_db
def test_rating_is_one_per_author_and_tech_is_whitelisted(call, client_user):
    c = auth_client(client_user)
    url = f"/api/v1/calls/{call.id}/feedback/"
    r = c.post(url, {"kind": "rating", "rating": 4, "tech": {"rttMs": 80, "codec": "VP9", "email": "x@y.z", "nested": {"a": 1}}}, format="json")
    assert r.status_code == 201, r.content
    r = c.post(url, {"kind": "rating", "rating": 2, "issues": ["avatar_lags"]}, format="json")
    assert r.status_code == 201
    fb = CallFeedback.objects.get(session=call, kind="rating")
    assert fb.rating == 2 and fb.role == "client" and fb.issues == ["avatar_lags"]
    assert CallFeedback.objects.filter(session=call).count() == 1
    first = CallFeedback.objects.get(pk=fb.pk)
    assert "email" not in first.tech


@pytest.mark.django_db
def test_problem_report_and_validation(call, psychologist):
    p = auth_client(psychologist.user)
    url = f"/api/v1/calls/{call.id}/feedback/"
    assert p.post(url, {"kind": "problem"}, format="json").status_code == 400
    assert p.post(url, {"kind": "rating"}, format="json").status_code == 400
    assert p.post(url, {"kind": "problem", "issues": ["bogus"]}, format="json").status_code == 400
    r = p.post(url, {"kind": "problem", "issues": ["no_audio"], "comment": "Не слышно"}, format="json")
    assert r.status_code == 201
    assert CallFeedback.objects.get(kind="problem").role == "psychologist"


@pytest.mark.django_db
def test_only_participants(call, api):
    other = User.objects.create_anonymous_client("otherpass123")
    url = f"/api/v1/calls/{call.id}/feedback/"
    assert api.post(url, {"kind": "rating", "rating": 5}, format="json").status_code == 401
    assert auth_client(other).post(url, {"kind": "rating", "rating": 5}, format="json").status_code == 403


@pytest.mark.django_db
def test_presence_reads_signaling_slot(call, client_user, psychologist):
    from django.core.cache import cache

    from apps.signaling.consumers import _slot_key

    url = f"/api/v1/calls/{call.id}/presence/"
    c = auth_client(client_user)
    assert c.get(url).json() == {"peer_in_room": False}
    cache.set(_slot_key(str(call.webrtc_room_id), "psychologist"), "chan", 60)
    assert c.get(url).json() == {"peer_in_room": True}
    # the specialist asks about the client, who isn't there
    assert auth_client(psychologist.user).get(url).json() == {"peer_in_room": False}
    cache.delete(_slot_key(str(call.webrtc_room_id), "psychologist"))
