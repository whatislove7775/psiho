"""H1: подбор специалиста по анкете и «Знакомство, 15 минут»."""
from datetime import timedelta

import pytest

from apps.availability import engine, services
from apps.dialogs import cards
from apps.sessions.models import ConsultationSession

from .conftest import auth_client
from .test_dialogs import fund
from .test_search import make

MATCH = "/api/v1/matching/"
S = ConsultationSession.Status


# ── Подбор по анкете ───────────────────────────────────────────────

@pytest.fixture
def team(db):
    return {
        "anna": make("Анна Соколова", specs=["Тревога", "Выгорание"], approach="Когнитивно-поведенческая терапия, ACT",
                     years=9, rate=2500, gender="female", start=18 * 60, end=21 * 60),
        "mark": make("Марк Литвинов", specs=["Отношения", "Горе и утрата"],
                     approach="Эмоционально-фокусированная терапия, гештальт", years=14, rate=4200, gender="male"),
        "vera": make("Вера Ким", specs=["Депрессия", "Сон"], approach="Психодинамический подход",
                     years=3, rate=2900, gender="female", start=9 * 60, end=11 * 60),
    }


def post(api, **answers):
    resp = api.post(MATCH, answers, format="json")
    assert resp.status_code == 200, resp.content
    return resp.json()


def test_match_ranks_by_topics_style_budget_time(api, team):
    data = post(api, topics=["anxiety", "burnout"], style="techniques", budget=3000, times=["evening"],
                tz="Europe/Moscow")
    assert data["stored"] is False and data["crisis"]["level"] == "none"
    top = data["results"][0]
    assert top["psychologist"]["display_name"] == "Анна Соколова"
    assert top["score"] >= 90
    s = top["summary"]
    assert "Работает с тревогой и выгоранием" in s
    assert "КПТ" in s and "вы выбрали конкретные техники" in s
    assert "вечером на этой неделе" in s and "в вашем бюджете" in s
    keys = {r["key"] for r in top["reasons"]}
    assert {"topics", "style", "budget", "time"} <= keys
    # оценка — сумма понятных частей
    assert sum(r["points"] for r in top["reasons"]) <= top["score"] + 5
    scores = [r["score"] for r in data["results"]]
    assert scores == sorted(scores, reverse=True)


def test_gender_preference_goes_first_and_mismatch_is_explained(api, team):
    data = post(api, topics=["relationships"], gender="female")
    names = [r["psychologist"]["display_name"] for r in data["results"]]
    assert names[-1] == "Марк Литвинов"  # лучший по теме, но пол не тот — в конце
    mark = data["results"][-1]
    assert mark["fits"] is False
    assert any(r["key"] == "gender" and not r["ok"] for r in mark["reasons"])


def test_over_budget_is_honest(api, team):
    data = post(api, topics=["grief"], budget=2000)
    mark = next(r for r in data["results"] if r["psychologist"]["display_name"] == "Марк Литвинов")
    budget = next(r for r in mark["reasons"] if r["key"] == "budget")
    assert budget["ok"] is False and "дороже вашего бюджета" in budget["text"]


def test_crisis_answer_returns_help_first(api, team):
    data = post(api, topics=["anxiety"], safety="now")
    assert data["crisis"]["level"] == "acute"
    phones = [h["phone"] for h in data["crisis"]["help"]]
    assert "112" in phones and "8-800-2000-122" in phones
    assert post(api, safety="sometimes")["crisis"]["level"] == "some"


def test_bad_answers_rejected_and_nothing_stored(api, team, django_assert_max_num_queries):
    assert api.post(MATCH, {"topics": ["nope"]}, format="json").status_code == 400
    assert api.post(MATCH, {"style": "hypnosis"}, format="json").status_code == 400
    # ни одной записи в базу: только чтение
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    with CaptureQueriesContext(connection) as ctx:
        post(api, topics=["anxiety"], times=["morning", "weekend"])
    writes = [q["sql"] for q in ctx.captured_queries if q["sql"].lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE"))]
    assert writes == []


def test_options_endpoint(api, db):
    data = api.get(MATCH + "options/").json()
    assert {t["value"] for t in data["topics"]} >= {"anxiety", "burnout", "relationships", "self_esteem", "grief"}
    assert sum(data["weights"].values()) == 100


# ── Знакомство, 15 минут ───────────────────────────────────────────

def enable_intro(profile, price=0):
    s = services.get_settings(profile)
    s.intro_enabled = True
    s.intro_price_rub = price
    s.save()
    profile._availability_settings = None
    del profile._availability_settings
    return s


def intro_start(profile):
    today = services.local_today(profile)
    starts = services.starts_for(profile, engine.INTRO_MINUTES, today + timedelta(days=2), today + timedelta(days=8))
    assert starts
    return starts


@pytest.mark.django_db
def test_intro_is_off_by_default(psychologist, client_user):
    assert services.booking_info(psychologist)["intro"]["enabled"] is False
    today = services.local_today(psychologist)
    assert services.starts_for(psychologist, 15, today, today + timedelta(days=7)) == []
    c = auth_client(client_user)
    resp = c.get(f"/api/v1/psychologists/{psychologist.id}/available-starts/", {"duration": 15})
    assert resp.status_code == 400
    start = services.starts_for(psychologist, 50, today + timedelta(days=2), today + timedelta(days=8))[0]
    resp = c.post("/api/v1/dialogues/book/", {"psychologist_id": psychologist.id,
                                               "scheduled_at": start.isoformat(), "duration_minutes": 15}, format="json")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_specialist_enables_intro_in_booking_rules(psychologist):
    p = auth_client(psychologist.user)
    resp = p.put("/api/v1/psychologist/availability/", {"intro_enabled": True, "intro_price_rub": 500}, format="json")
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert body["intro_enabled"] is True and body["intro_price_rub"] == 500 and body["intro_minutes"] == 15
    # 15 минут не становятся обычной длительностью
    assert 15 not in body["allowed_durations"]
    assert p.put("/api/v1/psychologist/availability/", {"intro_price_rub": 100_000}, format="json").status_code == 400
    card = p.get(f"/api/v1/psychologists/{psychologist.id}/").json()
    assert card["booking"]["intro"] == {"enabled": True, "minutes": 15, "price_rub": 500, "used": False}
    assert card["booking"]["min_duration"] == 50


@pytest.mark.django_db
def test_book_intro_once_with_own_price_and_intro_cards(psychologist, client_user):
    enable_intro(psychologist, price=300)
    fund(client_user)
    c = auth_client(client_user)
    resp = c.get(f"/api/v1/psychologists/{psychologist.id}/available-starts/", {"duration": 15})
    assert resp.status_code == 200 and resp.json()["price_rub"] == 300 and resp.json()["starts"]
    starts = intro_start(psychologist)
    resp = c.post("/api/v1/dialogues/book/", {"psychologist_id": psychologist.id,
                                               "scheduled_at": starts[0].isoformat(), "duration_minutes": 15},
                  format="json")
    assert resp.status_code == 201, resp.content
    call = resp.json()
    assert call["is_intro"] is True and call["amount_rub"] == 300 and call["duration_minutes"] == 15
    session = ConsultationSession.objects.get(pk=call["id"])
    assert session.amount_kopecks == 300 * 100 and session.status == S.PAID
    # карточка в диалоге говорит «Знакомство»
    text = cards.card_text(f"call:booked:{session.id}")
    assert text.startswith("Знакомство назначено")
    # второе знакомство с тем же специалистом — нельзя
    resp = c.post(f"/api/v1/dialogues/{call['dialogue_id']}/calls/",
                  {"scheduled_at": starts[-1].isoformat(), "duration_minutes": 15}, format="json")
    assert resp.status_code == 400 and "уже было" in resp.json()["detail"]
    detail = c.get(f"/api/v1/dialogues/{call['dialogue_id']}/").json()
    assert detail["booking"]["intro"]["used"] is True
    assert c.get(f"/api/v1/psychologists/{psychologist.id}/").json()["booking"]["intro"]["used"] is True
    # обычный созвон после знакомства — пожалуйста
    regular = services.starts_for(psychologist, 50, services.local_today(psychologist) + timedelta(days=9),
                                  services.local_today(psychologist) + timedelta(days=14))
    resp = c.post(f"/api/v1/dialogues/{call['dialogue_id']}/calls/",
                  {"scheduled_at": regular[0].isoformat(), "duration_minutes": 50}, format="json")
    assert resp.status_code == 201, resp.content
    assert resp.json()["is_intro"] is False


@pytest.mark.django_db
def test_free_intro_and_cancel_allows_rebooking(psychologist, client_user):
    enable_intro(psychologist, price=0)
    c = auth_client(client_user)  # баланс пустой — бесплатному знакомству он не нужен
    starts = intro_start(psychologist)
    resp = c.post("/api/v1/dialogues/book/", {"psychologist_id": psychologist.id,
                                               "scheduled_at": starts[0].isoformat(), "duration_minutes": 15},
                  format="json")
    assert resp.status_code == 201, resp.content
    call = resp.json()
    assert call["amount_rub"] == 0 and call["status"] == S.PAID
    resp = c.post(f"/api/v1/dialogues/{call['dialogue_id']}/calls/{call['id']}/cancel/", format="json")
    assert resp.status_code == 200, resp.content
    assert services.intro_used(client_user, psychologist) is False
    assert cards.card_text(f"call:cancelled:{call['id']}:client:free").startswith("Знакомство")


@pytest.mark.django_db
def test_search_filter_intro(api, db):
    a = make("Анна", specs=["Тревога"])
    make("Борис", specs=["Тревога"])
    enable_intro(a, price=0)
    resp = api.get("/api/v1/psychologists/search/", {"intro": "1"})
    assert [x["display_name"] for x in resp.json()["results"]] == ["Анна"]
    assert api.get("/api/v1/psychologists/popular-requests/").json()["intro"] == 1


def test_price_for_intro_uses_own_price(db, psychologist):
    enable_intro(psychologist, price=700)
    assert services.price_for(psychologist, 15) == 700
    from apps.billing.services import quote_call

    assert int(quote_call(psychologist, 15)) == 700
