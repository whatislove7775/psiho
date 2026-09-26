"""Поиск специалистов: текст, фильтры, ближайшее время, «Часто ищут»."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from apps.availability import services
from apps.availability.models import WeeklyRule, WeeklyTemplate
from apps.users import search
from apps.users.models import PsychologistProfile, User

URL = "/api/v1/psychologists/"
SEARCH = "/api/v1/psychologists/search/"
MSK = ZoneInfo("Europe/Moscow")
_n = 0


def make(name, *, specs=(), approach="", bio="", years=5, rate=3000, gender="", languages=("Русский",),
         days=range(7), start=10 * 60, end=13 * 60):
    """Одобренный специалист с недельным шаблоном (минуты от полуночи по Москве)."""
    global _n
    _n += 1
    user = User.objects.create_psychologist(email=f"s{_n}@example.com", password="psypass12345")
    profile = PsychologistProfile.objects.create(
        user=user, display_name=name, specializations=list(specs), approach=approach, bio=bio,
        experience_years=years, session_rate_rub=rate, gender=gender, languages=list(languages),
        verification_status=PsychologistProfile.VerificationStatus.APPROVED,
    )
    s = services.get_settings(profile)
    s.hourly_rate_rub = rate * 60 // 50
    s.save()
    services.sync_profile_rate(s)
    template = WeeklyTemplate.objects.create(profile=profile)
    WeeklyRule.objects.bulk_create([
        WeeklyRule(template=template, weekday=d, start_minute=start, end_minute=end) for d in days
    ])
    return profile


def names(resp):
    data = resp.json()
    items = data["results"] if isinstance(data, dict) else data
    return [x["display_name"] for x in items]


@pytest.fixture
def team(db):
    return {
        "anna": make("Анна Соколова", specs=["Тревога", "Выгорание"], approach="Когнитивно-поведенческая терапия, ACT",
                     bio="Работаю бережно", years=9, rate=3500, gender="female", languages=["Русский", "Английский"]),
        "mark": make("Марк Литвинов", specs=["Отношения", "Горе и утрата"],
                     approach="Эмоционально-фокусированная терапия, гештальт", years=14, rate=4200, gender="male"),
        "vera": make("Вера Ким", specs=["Депрессия", "Панические атаки", "Тревога"], approach="КПТ",
                     years=3, rate=2900, gender="female"),
    }


def test_text_search_by_name_topic_stem_and_approach(api, team):
    assert names(api.get(URL, {"q": "анна"})) == ["Анна Соколова"]
    # «анна» не находится внутри «фокусированная»: совпадение только по началу слова
    assert "Марк Литвинов" not in names(api.get(URL, {"q": "анна"}))
    assert set(names(api.get(URL, {"q": "тревожность"}))) == {"Анна Соколова", "Вера Ким"}
    assert names(api.get(URL, {"q": "отношениях"})) == ["Марк Литвинов"]
    assert names(api.get(URL, {"q": "паника"})) == ["Вера Ким"]
    # аббревиатура подхода находит полное название и наоборот
    assert set(names(api.get(URL, {"q": "кпт"}))) == {"Анна Соколова", "Вера Ким"}
    # забытая раскладка: «nhtdjuf» = «тревога»
    assert set(names(api.get(URL, {"q": "nhtdjuf"}))) == {"Анна Соколова", "Вера Ким"}
    # все слова должны найтись
    assert names(api.get(URL, {"q": "тревога гештальт"})) == []
    assert names(api.get(URL, {"q": "депрессия"})) == ["Вера Ким"]


def test_relevance_puts_name_match_first(api, team):
    make("Тревожный Пётр", specs=["Сон"])
    assert names(api.get(URL, {"q": "тревож"}))[0] == "Тревожный Пётр"


def test_filters(api, team):
    assert set(names(api.get(URL, {"gender": "male"}))) == {"Марк Литвинов"}
    assert names(api.get(URL, {"language": "английский"})) == ["Анна Соколова"]
    assert set(names(api.get(URL, {"min_experience": 5}))) == {"Анна Соколова", "Марк Литвинов"}
    assert names(api.get(URL, {"approach": "gestalt"})) == ["Марк Литвинов"]
    assert set(names(api.get(URL, {"approach": "cbt"}))) == {"Анна Соколова", "Вера Ким"}
    # несколько тем — «любая из»; больше совпадений — выше
    got = names(api.get(URL + "?topic=Тревога&topic=Депрессия"))
    assert got[0] == "Вера Ким" and set(got) == {"Анна Соколова", "Вера Ким"}
    assert names(api.get(URL, {"topics": "горе и утрата"})) == ["Марк Литвинов"]
    assert names(api.get(URL, {"max_rate": 3000})) == ["Вера Ким"]
    # с длительностью цена сравнивается за выбранную длительность (2900 за 50 мин → 6960 за 120)
    assert names(api.get(URL, {"max_rate": 6000, "duration": 120})) == []
    assert names(api.get(URL, {"max_rate": 7000, "duration": 120})) == ["Вера Ким"]
    assert names(api.get(URL, {"sort": "price"})) == ["Вера Ким", "Анна Соколова", "Марк Литвинов"]
    assert names(api.get(URL, {"sort": "experience"}))[0] == "Марк Литвинов"


def test_duration_filter_uses_specialist_limits(api, team):
    s = services.get_settings(team["mark"])
    s.durations = [50, 60]
    s.max_duration = 60
    s.save()
    assert "Марк Литвинов" not in names(api.get(URL, {"duration": 90}))
    assert "Марк Литвинов" in names(api.get(URL, {"duration": 60}))


@pytest.mark.parametrize("params", [
    {"when": "tomorrow"}, {"duration": 55}, {"gender": "x"}, {"approach": "nope"}, {"max_rate": "abc"},
    {"sort": "random"}, {"min_experience": 200},
])
def test_bad_params_are_400(api, team, params):
    resp = api.get(SEARCH, params)
    assert resp.status_code == 400 and resp.json()["detail"]


def test_unknown_timezone_is_ignored(api, team):
    assert api.get(SEARCH, {"tz": "Mars/Olympus"}).status_code == 200


def test_search_endpoint_shape_limit_and_next_slot(api, team):
    resp = api.get(SEARCH, {"limit": 2})
    data = resp.json()
    assert resp.status_code == 200 and data["count"] == 3 and len(data["results"]) == 2
    first = data["results"][0]
    assert first["next_slot"] is not None and "gender" in first
    # ближайшее время в поиске совпадает с тем, что считает карточка специалиста
    profile = PsychologistProfile.objects.get(pk=first["id"])
    expected = services.next_start(profile)
    assert first["next_slot"] == expected.strftime("%Y-%m-%dT%H:%M:%SZ")


def test_list_query_count_does_not_grow_with_specialists(api, team):
    with CaptureQueriesContext(connection) as three:
        assert len(api.get(URL).json()) == 3
    for i in range(5):
        make(f"Специалист {i}")
    with CaptureQueriesContext(connection) as eight:
        assert len(api.get(URL).json()) == 8
    assert len(eight.captured_queries) == len(three.captured_queries)
    assert len(eight.captured_queries) <= 12


def test_when_filters(db):
    # только суббота 19:00–22:00 по Москве
    sat = make("Субботняя", days=[5], start=19 * 60, end=22 * 60)
    # будни утром
    wk = make("Утренняя", days=[0, 1, 2, 3, 4], start=9 * 60, end=12 * 60)
    monday = datetime(2026, 9, 21, 6, 0, tzinfo=MSK)  # понедельник 06:00

    def run(when, now=monday, tz=MSK):
        q = search.Query(when=when, tz=tz)
        return {h.profile.display_name for h in search.search([sat, wk], q, now=now)}

    assert run("today") == {"Утренняя"}
    assert run("3days") == {"Утренняя"}
    assert run("weekend") == {"Субботняя"}
    assert run("evening") == {"Субботняя"}
    # в пятницу вечером «ближайшие 3 дня» — пятница, суббота, воскресенье
    friday = datetime(2026, 9, 25, 20, 0, tzinfo=MSK)
    assert run("3days", now=friday) == {"Субботняя"}
    assert run("today", now=friday) == set()
    # «вечер» — по поясу клиента: 11:00 МСК во Владивостоке уже 18:00, а суббота 19:00 МСК — ночь воскресенья
    assert run("evening", tz=ZoneInfo("Asia/Vladivostok")) == {"Утренняя"}
    hits = search.search([sat, wk], search.Query(), now=monday)
    by_name = {h.profile.display_name: h.next_start for h in hits}
    assert by_name["Утренняя"].astimezone(MSK) == datetime(2026, 9, 21, 9, 0, tzinfo=MSK)
    assert by_name["Субботняя"].astimezone(MSK) == datetime(2026, 9, 26, 19, 0, tzinfo=MSK)


def test_next_start_beyond_two_weeks(db):
    p = make("Далёкая", days=[])
    now = timezone.now()
    far_day = (now + timedelta(days=20)).astimezone(MSK).date()
    from apps.availability.models import DateOverride

    DateOverride.objects.create(profile=p, date=far_day, ranges=[[10 * 60, 14 * 60]])
    [hit] = search.search([p], search.Query(), now=now)
    assert hit.next_start and hit.next_start.astimezone(MSK).date() == far_day
    # «выходные» смотрят только ближайшие две недели: 20-й день туда не попадает
    assert search.search([p], search.Query(when="weekend"), now=now) == []


def test_booked_time_is_not_free(db, client_user):
    from apps.sessions.models import ConsultationSession

    p = make("Занятая", days=range(7), start=10 * 60, end=11 * 60)  # одно окно в день
    monday = datetime(2026, 9, 21, 6, 0, tzinfo=MSK)
    ConsultationSession.objects.create(
        client=client_user, psychologist_profile=p, status="paid",
        scheduled_at=datetime(2026, 9, 21, 10, 0, tzinfo=MSK), duration_minutes=50, amount_kopecks=100,
    )
    [hit] = search.search([p], search.Query(), now=monday)
    assert hit.next_start.astimezone(MSK).date() == datetime(2026, 9, 22).date()
    assert search.search([p], search.Query(when="today"), now=monday) == []


def test_popular_requests_and_facets(api, team):
    data = api.get("/api/v1/psychologists/popular-requests/").json()
    labels = [x["label"] for x in data["popular"]]
    # частые запросы, с которыми работают наши специалисты, идут первыми; чужих нет
    assert labels[:3] == ["Тревога", "Выгорание", "Отношения"]
    assert "Одиночество" not in labels
    assert {"label": "Тревога", "count": 2} in data["popular"]
    assert {x["value"] for x in data["approaches"]} >= {"cbt", "act", "gestalt", "eft"}
    assert {"label": "Английский", "count": 1} in data["languages"]
    assert 50 in data["durations"]
    assert {x["value"] for x in data["genders"]} == {"female", "male"}
    assert [x["value"] for x in data["when"]] == ["today", "3days", "evening", "weekend"]
    assert data["price"] == {"min": 2900, "max": 4200}


def test_hidden_specialists_are_not_found(api, team):
    team["mark"].verification_status = PsychologistProfile.VerificationStatus.SUSPENDED
    team["mark"].save()
    assert names(api.get(SEARCH, {"q": "марк"})) == []
    popular = api.get("/api/v1/psychologists/popular-requests/").json()
    assert "Отношения" not in [x["label"] for x in popular["popular"]]


def test_specialist_can_set_gender(db, psychologist):
    from apps.tests.conftest import auth_client

    c = auth_client(psychologist.user)
    assert c.patch("/api/v1/psychologist/profile/", {"gender": "female"}, format="json").json()["gender"] == "female"
    assert c.patch("/api/v1/psychologist/profile/", {"gender": "robot"}, format="json").status_code == 400
    assert c.patch("/api/v1/psychologist/profile/", {"gender": ""}, format="json").json()["gender"] == ""
