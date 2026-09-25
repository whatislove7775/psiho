"""Диалоги: доступ только участникам, созвоны внутри диалога, карточки, предложения, заметки, антиспам."""
import json
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.availability import services as availability
from apps.chat.models import Conversation, Message
from apps.dialogs.models import SpecialistNote
from apps.sessions.models import ConsultationSession
from apps.users.models import PsychologistProfile, User

from .conftest import auth_client

S = ConsultationSession.Status


@pytest.fixture
def other_client(db):
    return User.objects.create_anonymous_client("otherpass123")


def start(c, psychologist):
    resp = c.post("/api/v1/dialogues/", {"psychologist_id": psychologist.id}, format="json")
    assert resp.status_code in (200, 201), resp.content
    return resp.json()


def free_start(profile, days_ahead=3, duration=None):
    duration = duration or availability.allowed_durations(availability.get_settings(profile))[0]
    today = availability.local_today(profile)
    first = today + timedelta(days=days_ahead)
    starts = availability.starts_for(profile, duration, first, first + timedelta(days=6))
    assert starts, "в расписании нет свободного времени"
    return starts, duration


@pytest.fixture
def dialog(client_user, psychologist):
    c = auth_client(client_user)
    d = start(c, psychologist)
    return c, auth_client(psychologist.user), d


def fund(user, rub=100_000):
    """Если подключён apps.billing — пополняем анонимный баланс, чтобы созвон оплатился сразу."""
    from django.apps import apps

    if apps.is_installed("apps.billing"):
        from apps.billing import services as B

        B.adjust_client_balance(user, rub * 100, reason="тест", key=B.new_idempotency_key())


def messages(c, conv_id):
    return c.get(f"/api/v1/chat/conversations/{conv_id}/messages/").json()["results"]


# ── Доступ ────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_only_participants_see_dialogue(dialog, other_client, admin_user, client_user):
    c, p, d = dialog
    assert d["kind"] == "specialist" and d["my_role"] == "client"
    assert d["counterpart"]["name"] == "Анна"
    # Специалист видит клиента только по псевдониму
    pd = p.get(f"/api/v1/dialogues/{d['id']}/").json()
    assert pd["my_role"] == "specialist"
    assert pd["counterpart"]["name"] == client_user.alias
    assert "email" not in json.dumps(pd)
    # Посторонний клиент и сотрудники (даже суперпользователь) не видят диалог и его ленту
    staff = User.objects.create_user(alias="support1", password="supportpass123", role="admin", is_staff=True)
    for outsider in (auth_client(other_client), auth_client(admin_user), auth_client(staff)):
        assert outsider.get(f"/api/v1/dialogues/{d['id']}/").status_code == 404
        assert outsider.get(f"/api/v1/dialogues/{d['id']}/starts/").status_code == 404
        assert outsider.get(f"/api/v1/chat/conversations/{d['id']}/messages/").status_code == 404
        assert outsider.post(f"/api/v1/dialogues/{d['id']}/proposals/", {}, format="json").status_code == 404
        ids = [x["id"] for x in outsider.get("/api/v1/dialogues/").json()]
        assert d["id"] not in ids
    # Заметки — только специалисту
    assert c.get(f"/api/v1/dialogues/{d['id']}/note/").status_code == 403


@pytest.mark.django_db
def test_list_has_pinned_support_and_tisha(dialog, psychologist):
    c, p, d = dialog
    items = c.get("/api/v1/dialogues/").json()
    kinds = [x["kind"] for x in items]
    assert kinds.count("specialist") == 1 and "support" in kinds and "ai" in kinds
    assert all(x["pinned"] for x in items if x["kind"] != "specialist")
    pitems = p.get("/api/v1/dialogues/").json()
    assert [x["kind"] for x in pitems].count("support") == 1
    assert "ai" not in [x["kind"] for x in pitems]


@pytest.mark.django_db
def test_legacy_sessions_get_a_dialogue(client_user, psychologist):
    ConsultationSession.objects.create(client=client_user, psychologist_profile=psychologist, status=S.COMPLETED,
                                       scheduled_at=timezone.now() - timedelta(days=3), amount_kopecks=300000)
    items = auth_client(client_user).get("/api/v1/dialogues/").json()
    sp = [x for x in items if x["kind"] == "specialist"]
    assert len(sp) == 1 and sp[0]["calls_count"] == 1


# ── Антиспам ─────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_first_messages_limit_until_specialist_replies(dialog, settings):
    settings.DIALOG_FIRST_MESSAGES = 2
    c, p, d = dialog
    url = f"/api/v1/chat/conversations/{d['id']}/messages/"
    assert c.post(url, {"text": "Здравствуйте"}, format="json").status_code == 201
    assert c.post(url, {"text": "Можно вопрос?"}, format="json").status_code == 201
    assert c.post(url, {"text": "Ау"}, format="json").status_code == 403
    assert p.post(url, {"text": "Здравствуйте! Слушаю вас."}, format="json").status_code == 201
    assert c.post(url, {"text": "Спасибо"}, format="json").status_code == 201


@pytest.mark.django_db
def test_new_dialogues_per_day_limit(client_user, settings, psychologist):
    settings.DIALOG_NEW_PER_DAY = 1
    c = auth_client(client_user)
    start(c, psychologist)
    assert start(c, psychologist)["id"]  # существующий диалог открывается без лимита
    user2 = User.objects.create_psychologist(email="p2@example.com", password="psypass12345")
    p2 = PsychologistProfile.objects.create(user=user2, display_name="Борис", bio="", specializations=[],
                                            session_rate_rub=3000,
                                            verification_status=PsychologistProfile.VerificationStatus.APPROVED)
    assert c.post("/api/v1/dialogues/", {"psychologist_id": p2.id}, format="json").status_code == 429


@pytest.mark.django_db
def test_old_gate_still_available(client_user, psychologist, settings):
    settings.CHAT_ALLOW_WITHOUT_BOOKING = False
    c = auth_client(client_user)
    assert c.post("/api/v1/dialogues/", {"psychologist_id": psychologist.id}, format="json").status_code == 403


# ── Созвоны ──────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_book_reschedule_cancel_with_cards(dialog, psychologist, client_user):
    c, p, d = dialog
    fund(client_user)
    starts, duration = free_start(psychologist)
    resp = c.post(f"/api/v1/dialogues/{d['id']}/calls/", {"scheduled_at": starts[0].isoformat(),
                                                          "duration_minutes": duration}, format="json")
    assert resp.status_code == 201, resp.content
    call = resp.json()
    assert call["status"] == "paid"  # с баланса (apps.billing) или dev-режим без провайдера
    # Специалист не назначает созвон сам
    assert p.post(f"/api/v1/dialogues/{d['id']}/calls/", {"scheduled_at": starts[1].isoformat()},
                  format="json").status_code == 403

    det = c.get(f"/api/v1/dialogues/{d['id']}/").json()
    assert det["next_call"]["id"] == call["id"] and det["status"] == "scheduled"
    assert det["first_messages_left"] is None

    # Перенос
    resp = c.post(f"/api/v1/dialogues/{d['id']}/calls/{call['id']}/reschedule/",
                  {"scheduled_at": starts[1].isoformat()}, format="json")
    assert resp.status_code == 200, resp.content
    assert resp.json()["scheduled_at"].startswith(starts[1].isoformat()[:16])
    # Отмена
    resp = c.post(f"/api/v1/dialogues/{d['id']}/calls/{call['id']}/cancel/")
    assert resp.status_code == 200 and resp.json()["refund"] == "full"
    from django.apps import apps

    if apps.is_installed("apps.billing"):
        from apps.billing.ledger import balance_of

        assert balance_of(client_user) == 100_000 * 100  # заморозка вернулась полностью

    cards = [m["card"] for m in messages(c, d["id"]) if m["kind"] == "system"]
    assert [x["type"] for x in cards] == ["booked", "rescheduled", "cancelled"]
    assert all(x["call"]["status"] == "cancelled" for x in cards)  # карточки показывают актуальный статус
    texts = [m["text"] for m in messages(p, d["id"]) if m["kind"] == "system"]
    assert texts[0].startswith("Созвон назначен")


@pytest.mark.django_db
def test_book_without_balance_waits_for_payment(dialog, psychologist):
    c, p, d = dialog
    starts, duration = free_start(psychologist)
    call = c.post(f"/api/v1/dialogues/{d['id']}/calls/", {"scheduled_at": starts[0].isoformat(),
                                                          "duration_minutes": duration}, format="json").json()
    from django.apps import apps

    if apps.is_installed("apps.billing"):
        assert call["status"] == "awaiting_payment" and call["pay_mode"] == "balance"
    det = c.get(f"/api/v1/dialogues/{d['id']}/").json()
    assert det["next_call"]["id"] == call["id"]
    sess = c.get(f"/api/v1/sessions/{call['id']}/").json()
    assert sess["conversation_id"] == d["id"] == sess["dialogue_id"]


@pytest.mark.django_db
def test_late_client_reschedule_forbidden(dialog, psychologist, client_user):
    c, p, d = dialog
    session = ConsultationSession.objects.create(
        client=client_user, psychologist_profile=psychologist, status=S.PAID,
        scheduled_at=timezone.now() + timedelta(hours=3), amount_kopecks=300000)
    starts, _ = free_start(psychologist)
    resp = c.post(f"/api/v1/dialogues/{d['id']}/calls/{session.id}/reschedule/",
                  {"scheduled_at": starts[0].isoformat()}, format="json")
    assert resp.status_code == 403
    resp = c.post(f"/api/v1/dialogues/{d['id']}/calls/{session.id}/cancel/")
    assert resp.status_code == 200 and resp.json()["late"] is True


@pytest.mark.django_db
def test_specialist_proposal_accept_and_decline(dialog, psychologist, client_user):
    c, p, d = dialog
    fund(client_user)
    starts, duration = free_start(psychologist)
    resp = p.post(f"/api/v1/dialogues/{d['id']}/proposals/", {"scheduled_at": starts[0].isoformat(),
                                                              "duration_minutes": duration}, format="json")
    assert resp.status_code == 201, resp.content
    prop = resp.json()
    assert prop["status"] == "pending"
    # Клиент не может предлагать, специалист не может принять своё
    assert c.post(f"/api/v1/dialogues/{d['id']}/proposals/", {"scheduled_at": starts[1].isoformat()},
                  format="json").status_code == 403
    assert p.post(f"/api/v1/dialogues/{d['id']}/proposals/{prop['id']}/accept/").status_code == 403

    resp = c.post(f"/api/v1/dialogues/{d['id']}/proposals/{prop['id']}/accept/")
    assert resp.status_code == 201, resp.content
    card = [m["card"] for m in messages(c, d["id"]) if m["kind"] == "system"][0]
    assert card["type"] == "proposed" and card["proposal"]["status"] == "accepted"
    assert card["proposal"]["session_id"] == resp.json()["id"]

    resp = p.post(f"/api/v1/dialogues/{d['id']}/proposals/", {"scheduled_at": starts[2].isoformat(),
                                                              "duration_minutes": duration}, format="json")
    prop2 = resp.json()
    assert c.post(f"/api/v1/dialogues/{d['id']}/proposals/{prop2['id']}/close/").json()["status"] == "declined"
    assert c.post(f"/api/v1/dialogues/{d['id']}/proposals/{prop2['id']}/accept/").status_code == 400


@pytest.mark.django_db
def test_started_and_ended_cards(dialog, psychologist, client_user):
    c, p, d = dialog
    session = ConsultationSession.objects.create(
        client=client_user, psychologist_profile=psychologist, status=S.PAID,
        scheduled_at=timezone.now() + timedelta(minutes=2), amount_kopecks=300000)
    assert c.post(f"/api/v1/sessions/{session.id}/join/").status_code == 200
    det = c.get(f"/api/v1/dialogues/{d['id']}/").json()
    assert det["status"] == "live" and det["next_call"]["can_join"]
    assert c.get(f"/api/v1/sessions/{session.id}/").json()["dialogue_id"] == d["id"]
    assert p.post(f"/api/v1/sessions/{session.id}/complete/").status_code == 200
    types = [m["card"]["type"] for m in messages(c, d["id"]) if m["kind"] == "system"]
    assert types == ["started", "ended"]


# ── Заметки ──────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_specialist_notes_are_private_and_encrypted(dialog):
    c, p, d = dialog
    resp = p.put(f"/api/v1/dialogues/{d['id']}/note/", {"text": "Тревога перед экзаменом"}, format="json")
    assert resp.status_code == 200 and resp.json()["text"] == "Тревога перед экзаменом"
    note = SpecialistNote.objects.get()
    assert b"\xd0\xa2\xd1\x80\xd0\xb5" not in bytes(note.text_enc)  # «Тре» не лежит открытым текстом
    assert p.get(f"/api/v1/dialogues/{d['id']}/note/").json()["text"] == "Тревога перед экзаменом"
    assert c.put(f"/api/v1/dialogues/{d['id']}/note/", {"text": "x"}, format="json").status_code == 403


@pytest.mark.django_db
def test_support_conversation_is_not_a_dialogue(client_user):
    c = auth_client(client_user)
    conv = c.post("/api/v1/chat/conversations/", {"with": "support"}, format="json").json()
    assert c.get(f"/api/v1/dialogues/{conv['id']}/").status_code == 404
    assert Conversation.objects.filter(kind="client_support").count() == 1
    assert Message.objects.count() == 1


@pytest.mark.django_db
def test_book_from_profile_creates_dialogue(client_user, psychologist, settings):
    settings.DIALOG_NEW_PER_DAY = 0  # лимит новых диалогов не мешает записи с оплатой
    fund(client_user)
    c = auth_client(client_user)
    starts, duration = free_start(psychologist)
    resp = c.post("/api/v1/dialogues/book/", {"psychologist_id": psychologist.id, "scheduled_at": starts[0].isoformat(),
                                               "duration_minutes": duration}, format="json")
    assert resp.status_code == 201, resp.content
    d = c.get(f"/api/v1/dialogues/{resp.json()['dialogue_id']}/").json()
    assert d["next_call"]["id"] == resp.json()["id"]
    # Занятое время — диалог не создаётся
    other = User.objects.create_anonymous_client("otherpass123")
    r2 = auth_client(other).post("/api/v1/dialogues/book/", {"psychologist_id": psychologist.id,
                                                              "scheduled_at": starts[0].isoformat(),
                                                              "duration_minutes": duration}, format="json")
    assert r2.status_code == 400
    assert not Conversation.objects.filter(client=other).exists()
