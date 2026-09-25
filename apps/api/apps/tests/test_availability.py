"""Гибкое расписание: расчёт свободных начал, особые дни, длительности, цена, гонка записи."""
from datetime import date, datetime, time, timedelta
from datetime import timezone as dt_tz
from unittest import mock
from zoneinfo import ZoneInfo

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.availability import engine, services
from apps.availability.models import AvailabilitySettings, WeeklyTemplate
from apps.sessions.models import ConsultationSession

from .conftest import auth_client

MSK = ZoneInfo("Europe/Moscow")
UTC = dt_tz.utc
MON = date(2030, 1, 7)  # понедельник, далеко в будущем
NOW = datetime(2030, 1, 6, 12, 0, tzinfo=MSK)  # воскресенье, полдень


def at(d: date, h: int, m: int = 0, tz=MSK) -> datetime:
    return datetime(d.year, d.month, d.day, h, m, tzinfo=tz).astimezone(UTC)


def week(**by_day) -> list[list[tuple[int, int]]]:
    """week(mon=[(10, 14)]) → 7 списков интервалов в минутах."""
    names = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    return [[(a * 60, b * 60) for a, b in by_day.get(n, [])] for n in names]


def av(days=None, **kw) -> engine.Availability:
    params = dict(
        tz=MSK, templates=[engine.Template(None, None, days or week(mon=[(10, 14)]))],
        durations=engine.DURATION_OPTIONS, buffer=0, notice=60, horizon_days=28, step=30,
    )
    params.update(kw)
    return engine.Availability(**params)


def starts(a, duration=50, first=MON, last=MON, busy=(), now=NOW):
    return engine.available_starts(a, duration, first, last, list(busy), now)


# ── Движок ──────────────────────────────────────────────────────

def test_grid_and_duration_fits_window():
    got = starts(av(), duration=120)
    # 10:00 … 12:00 каждые 30 минут: 12:00 + 2 ч = 14:00 — ровно конец окна
    assert got == [at(MON, 10), at(MON, 10, 30), at(MON, 11), at(MON, 11, 30), at(MON, 12)]
    assert starts(av(), duration=180) == [at(MON, 10), at(MON, 10, 30), at(MON, 11)]
    assert starts(av(days=week(mon=[(10, 12)])), duration=150) == []


def test_multiple_ranges_per_day_and_step():
    a = av(days=week(mon=[(10, 12), (16, 18)]), step=60)
    assert starts(a, duration=60) == [at(MON, 10), at(MON, 11), at(MON, 16), at(MON, 17)]
    # соседние интервалы склеиваются: 10–12 + 12–14 вмещают 3 часа с 10:00
    b = av(days=week(mon=[(10, 12), (12, 14)]), step=60)
    assert at(MON, 10) in starts(b, duration=180)


def test_buffer_and_packing_after_booking():
    busy = [(at(MON, 10), at(MON, 11, 20))]  # 80-минутная сессия
    a = av(buffer=15, step=60)
    got = starts(a, duration=50, busy=busy)
    # после 11:20 + 15 мин буфера следующая сессия возможна с 11:35 (не ждём 12:00)
    assert got[0] == at(MON, 11, 35)
    assert at(MON, 12) in got and at(MON, 13) in got
    # перед занятой сессией тоже нужен буфер: 50 мин в 13:00 до сессии в 14:00 с буфером 15 — нет
    busy2 = [(at(MON, 13, 50), at(MON, 14))]
    assert at(MON, 13) not in starts(av(days=week(mon=[(10, 15)]), buffer=15, step=60), 50, busy=busy2)
    assert at(MON, 12) in starts(av(days=week(mon=[(10, 15)]), buffer=15, step=60), 50, busy=busy2)


def test_overlap_with_existing_sessions():
    busy = [(at(MON, 11), at(MON, 12, 30))]
    got = starts(av(buffer=0), duration=60, busy=busy)
    assert at(MON, 10) in got  # 10:00–11:00 вплотную
    assert at(MON, 10, 30) not in got and at(MON, 11) not in got and at(MON, 12) not in got
    assert at(MON, 12, 30) in got and at(MON, 13) in got


def test_min_notice_and_horizon():
    now = at(MON, 9, 45)
    a = av(notice=12 * 60)
    assert starts(a, now=now) == []  # всё в понедельник раньше 21:45
    tue = MON + timedelta(days=1)
    a2 = av(days=week(mon=[(10, 14)], tue=[(10, 14)]), notice=60)
    assert starts(a2, first=MON, last=tue, now=now)[0] == at(MON, 11)  # 09:45 + 1 ч → ближайшая сетка 11:00
    # горизонт: не дальше чем на horizon_days от сегодняшней даты специалиста
    every_day = week(**{n: [(10, 14)] for n in ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]})
    a3 = av(days=every_day, horizon_days=7)  # сегодня 6 января → последний день записи 13 января
    assert starts(a3, first=date(2030, 1, 13), last=date(2030, 1, 13)) != []
    assert starts(a3, first=date(2030, 1, 14), last=date(2030, 1, 20)) == []


def test_overrides_time_off_and_templates():
    tue = MON + timedelta(days=1)
    base = week(mon=[(10, 14)], tue=[(10, 14)])
    a = av(days=base, overrides={MON: [(18 * 60, 20 * 60)], tue: []})
    assert starts(a, 60) == [at(MON, 18), at(MON, 18, 30), at(MON, 19)]  # особый график заменяет шаблон
    assert starts(a, 60, first=tue, last=tue) == []  # выходной
    assert engine.day_plan(a, tue) == ("override", [])

    off = av(days=base, overrides={MON: [(18 * 60, 20 * 60)]}, time_off=[(MON, tue)])
    assert starts(off, 60, first=MON, last=tue) == []  # отпуск важнее всего
    assert engine.day_plan(off, MON)[0] == "time_off"

    # шаблон «с даты» побеждает основной; valid_until ограничивает
    summer = engine.Template(tue, tue, week(tue=[(8, 9)]), order=2)
    t = av(days=base, templates=[engine.Template(None, None, base, order=1), summer])
    assert starts(t, 60, first=tue, last=tue) == [at(tue, 8)]
    wed_next = tue + timedelta(days=7)
    assert starts(t, 60, first=wed_next, last=wed_next)[0] == at(wed_next, 10)
    assert engine.day_plan(t, MON + timedelta(days=2)) == ("template", [])


def test_duration_limits():
    a = av(durations=(60, 90))
    assert starts(a, 50) == []
    assert starts(a, 90)[0] == at(MON, 10)


def test_time_zone_correct_and_cross_midnight():
    ekb = ZoneInfo("Asia/Yekaterinburg")  # UTC+5
    a = av(tz=ekb, days=week(mon=[(10, 12)]))
    assert starts(a, 60, now=NOW)[0] == datetime(2030, 1, 7, 5, 0, tzinfo=UTC)
    # 22:00–24:00 в пн и 00:00–01:00 во вт склеиваются: 90 минут с 23:30 помещаются
    b = av(days=week(mon=[(22, 24)], tue=[(0, 1)]))
    assert at(MON, 23, 30) in starts(b, 90)
    # DST: в Берлине 30.03.2031 часы переводятся; 10:00 по местному остаётся 10:00 (UTC+2)
    berlin = ZoneInfo("Europe/Berlin")
    sun = date(2031, 3, 30)
    c = av(tz=berlin, days=week(sun=[(10, 12)]))
    got = engine.available_starts(c, 60, sun, sun, [], datetime(2031, 3, 29, tzinfo=UTC))
    assert got[0] == datetime(2031, 3, 30, 8, 0, tzinfo=UTC)


def test_price_rounding():
    assert engine.round_price(3600, 50) == 3000
    assert engine.round_price(3600, 90) == 5400
    assert engine.round_price(3500, 50) == 2920  # 2916.67 → 2920
    assert engine.round_price(3500, 80) == 4670  # 4666.67 → 4670
    assert engine.round_price(3000, 50) == 2500
    assert services.legacy_hourly_rate(3000) == 3600


def test_validate_ranges():
    assert engine.validate_ranges([(600, 840), (960, 1440)]) is None
    assert engine.validate_ranges([(600, 600)])
    assert engine.validate_ranges([(600, 700), (650, 800)])
    assert engine.validate_ranges([(601, 700)])


# ── API специалиста ─────────────────────────────────────────────

@pytest.fixture
def day():
    return timezone.now().astimezone(MSK).date() + timedelta(days=3)


@pytest.mark.django_db
def test_legacy_schedule_imported_lazily(psychologist):
    # фикстура создаёт старые правила 10–13 на каждый день
    s = services.get_settings(psychologist)
    assert s.hourly_rate_rub == 3600 and s.min_duration == 50 and s.max_duration == 180
    t = WeeklyTemplate.objects.get(profile=psychologist)
    assert t.rules.count() == 7 and t.rules.first().start_minute == 600


@pytest.mark.django_db
def test_availability_put_get_and_validation(psychologist, api, day):
    p = auth_client(psychologist.user)
    data = p.get("/api/v1/psychologist/availability/").json()
    assert data["time_zone"] == "Europe/Moscow" and data["hourly_rate_rub"] == 3600
    assert data["templates"][0]["days"][0] == [{"start": "10:00", "end": "13:00"}]
    assert data["prices"][0] == {"minutes": 50, "price_rub": 3000}

    days = [[] for _ in range(7)]
    days[day.weekday()] = [{"start": "10:00", "end": "14:00"}, {"start": "16:00", "end": "24:00"}]
    body = {
        "min_duration": 60, "max_duration": 90, "durations": [50, 60, 90, 180], "buffer_minutes": 15,
        "min_notice_minutes": 720, "horizon_days": 14, "start_step_minutes": 15, "hourly_rate_rub": 4000,
        "time_zone": "Asia/Yekaterinburg",
        "templates": [{"valid_from": None, "valid_until": None, "days": days}],
    }
    resp = p.put("/api/v1/psychologist/availability/", body, format="json")
    assert resp.status_code == 200, resp.content
    got = resp.json()
    assert got["allowed_durations"] == [60, 90]
    assert got["prices"] == [{"minutes": 60, "price_rub": 4000}, {"minutes": 90, "price_rub": 6000}]
    assert got["templates"][0]["days"][day.weekday()][1] == {"start": "16:00", "end": "24:00"}
    psychologist.refresh_from_db()
    assert psychologist.session_rate_rub == 4000  # «от» — цена самой короткой сессии

    bad = [
        {"min_duration": 120, "max_duration": 60},
        {"durations": [45]},
        {"min_duration": 150, "max_duration": 180, "durations": [50, 60]},
        {"time_zone": "Mars/Base"},
        {"hourly_rate_rub": 10},
        {"templates": [{"days": [[{"start": "10:00", "end": "12:00"}, {"start": "11:00", "end": "13:00"}]] + [[]] * 6}]},
        {"templates": [{"days": [[{"start": "14:00", "end": "12:00"}]] + [[]] * 6}]},
        {"templates": [{"valid_from": "2030-02-01", "valid_until": "2030-01-01", "days": [[]] * 7}]},
    ]
    for payload in bad:
        assert p.put("/api/v1/psychologist/availability/", payload, format="json").status_code == 400, payload

    # публичная карточка отдаёт длительности и цены
    card = api.get(f"/api/v1/psychologists/{psychologist.id}/").json()
    assert card["booking"]["durations"] == [{"minutes": 60, "price_rub": 4000}, {"minutes": 90, "price_rub": 6000}]
    assert card["session_rate_rub"] == 4000
    # клиенты не могут редактировать расписание
    assert api.get("/api/v1/psychologist/availability/").status_code == 401


@pytest.mark.django_db
def test_overrides_time_off_and_calendar(psychologist, api, day):
    p = auth_client(psychologist.user)
    resp = p.put(f"/api/v1/psychologist/availability/overrides/{day.isoformat()}/",
                 {"ranges": [{"start": "18:00", "end": "20:00"}]}, format="json")
    assert resp.status_code == 200, resp.content
    starts_url = f"/api/v1/psychologists/{psychologist.id}/available-starts/?duration=60&from={day}&to={day}"
    got = api.get(starts_url).json()
    assert got["starts"][0] == at(day, 18).isoformat().replace("+00:00", "Z")
    assert got["price_rub"] == 3600 and got["duration_minutes"] == 60

    cal = p.get(f"/api/v1/psychologist/availability/calendar/?from={day}&to={day + timedelta(days=1)}").json()
    assert cal["days"][0]["source"] == "override" and cal["days"][0]["ranges"] == [{"start": "18:00", "end": "20:00"}]
    assert cal["days"][1]["source"] == "template"

    # выходной вручную
    p.put(f"/api/v1/psychologist/availability/overrides/{day}/", {"ranges": []}, format="json")
    assert api.get(starts_url).json()["starts"] == []
    # вернуть как в шаблоне
    assert p.delete(f"/api/v1/psychologist/availability/overrides/{day}/").status_code == 204
    assert api.get(starts_url).json()["starts"][0] == at(day, 10).isoformat().replace("+00:00", "Z")

    # отпуск
    resp = p.post("/api/v1/psychologist/availability/time-off/",
                  {"start_date": str(day), "end_date": str(day + timedelta(days=2)), "note": "Отпуск"}, format="json")
    assert resp.status_code == 201
    assert api.get(starts_url).json()["starts"] == []
    assert p.post("/api/v1/psychologist/availability/time-off/",
                  {"start_date": str(day), "end_date": str(day - timedelta(days=1))}, format="json").status_code == 400
    assert len(p.get("/api/v1/psychologist/availability/time-off/").json()) == 1
    assert p.delete(f"/api/v1/psychologist/availability/time-off/{resp.json()['id']}/").status_code == 204
    assert api.get(starts_url).json()["starts"] != []

    # недопустимая длительность
    assert api.get(starts_url.replace("duration=60", "duration=45")).status_code == 400


@pytest.mark.django_db
def test_booking_durations_and_price(psychologist, client_user, day, settings):
    s = services.get_settings(psychologist)
    s.min_duration, s.max_duration, s.durations = 50, 120, [50, 90, 120]
    s.save()
    c = auth_client(client_user)
    base = {"psychologist_id": psychologist.id, "scheduled_at": at(day, 10).isoformat()}
    assert c.post("/api/v1/sessions/book/", {**base, "duration_minutes": 180}, format="json").status_code == 400
    resp = c.post("/api/v1/sessions/book/", {**base, "duration_minutes": 90}, format="json")
    assert resp.status_code == 201, resp.content
    assert resp.json()["duration_minutes"] == 90 and resp.json()["amount_rub"] == 5400

    # после 11:30 + 10 мин буфера: 11:40 доступно для 50 минут? 11:40 + 50 = 12:30 ≤ 13:00
    other = client_user.__class__.objects.create_anonymous_client("otherpass123")
    o = auth_client(other)
    busy_start = {**base, "scheduled_at": at(day, 11, 30).isoformat(), "duration_minutes": 50}
    assert o.post("/api/v1/sessions/book/", busy_start, format="json").status_code == 400  # в буфере
    ok = {**base, "scheduled_at": at(day, 11, 40).isoformat(), "duration_minutes": 50}
    assert o.post("/api/v1/sessions/book/", ok, format="json").status_code == 201

    # YooKassa получает рассчитанную цену
    settings.YOOKASSA_SHOP_ID, settings.YOOKASSA_SECRET_KEY = "shop", "key"
    fake = mock.Mock(id="yk-dur")
    fake.confirmation.confirmation_url = "https://yoomoney.ru/checkout/dur"
    third = client_user.__class__.objects.create_anonymous_client("thirdpass123")
    with mock.patch("apps.payments.services.YKPayment") as yk:
        yk.create.return_value = fake
        resp = auth_client(third).post("/api/v1/sessions/book/", {
            **base, "scheduled_at": at(day + timedelta(days=1), 10).isoformat(), "duration_minutes": 120,
        }, format="json")
    assert resp.status_code == 201, resp.content
    assert yk.create.call_args[0][0]["amount"]["value"] == "7200.00"


@pytest.mark.django_db
def test_booking_race_is_prevented(psychologist, client_user, day):
    """Две записи на одно время, проверка расписания «прошла» у обеих (устаревшие данные)."""
    other = client_user.__class__.objects.create_anonymous_client("racepass123")
    payload = {"psychologist_id": psychologist.id, "scheduled_at": at(day, 10).isoformat(), "duration_minutes": 50}
    with mock.patch("apps.sessions.views.check_bookable", return_value=None):
        first = auth_client(client_user).post("/api/v1/sessions/book/", payload, format="json")
        second = auth_client(other).post("/api/v1/sessions/book/", payload, format="json")
    assert first.status_code == 201
    assert second.status_code == 400 and "заняли" in second.json()["detail"]
    assert ConsultationSession.objects.filter(psychologist_profile=psychologist).count() == 1

    # на уровне БД: вторая активная сессия на то же начало невозможна, отменённая — возможна
    with pytest.raises(IntegrityError), transaction.atomic():
        ConsultationSession.objects.create(
            client=other, psychologist_profile=psychologist, scheduled_at=at(day, 10),
            amount_kopecks=1, status="paid",
        )
    ConsultationSession.objects.create(
        client=other, psychologist_profile=psychologist, scheduled_at=at(day, 10),
        amount_kopecks=1, status="cancelled",
    )


@pytest.mark.django_db
def test_legacy_profile_rate_patch_updates_hourly(psychologist):
    p = auth_client(psychologist.user)
    resp = p.patch("/api/v1/psychologist/profile/", {"session_rate_rub": 2500}, format="json")
    assert resp.status_code == 200
    assert AvailabilitySettings.objects.get(profile=psychologist).hourly_rate_rub == 3000


# ── Миграция данных ────────────────────────────────────────────

@pytest.mark.django_db(transaction=True)
def test_data_migration_imports_legacy_schedule():
    from django.db import connection
    from django.db.migrations.executor import MigrationExecutor

    executor = MigrationExecutor(connection)
    target = [("availability", "0001_initial")]
    executor.migrate(target)
    old = executor.loader.project_state(target).apps
    User = old.get_model("users", "User")
    Profile = old.get_model("users", "PsychologistProfile")
    Legacy = old.get_model("users", "PsychologistSchedule")
    user = User.objects.create(alias="mig-psy", role="psychologist")
    profile = Profile.objects.create(user=user, display_name="М", session_rate_rub=3500)
    Legacy.objects.create(psychologist=profile, weekday=0, start_time=time(10), end_time=time(14))
    Legacy.objects.create(psychologist=profile, weekday=0, start_time=time(16), end_time=time(20))
    Legacy.objects.create(psychologist=profile, weekday=3, start_time=time(9), end_time=time(12), is_active=False)

    executor = MigrationExecutor(connection)
    executor.migrate([("availability", "0002_import_legacy_schedule")])
    new = executor.loader.project_state([("availability", "0002_import_legacy_schedule")]).apps
    s = new.get_model("availability", "AvailabilitySettings").objects.get(profile_id=profile.pk)
    assert s.hourly_rate_rub == 4200 and s.min_notice_minutes == 60 and s.buffer_minutes == 10
    rules = new.get_model("availability", "WeeklyRule").objects.filter(template__profile_id=profile.pk)
    assert sorted((r.weekday, r.start_minute, r.end_minute) for r in rules) == [(0, 600, 840), (0, 960, 1200)]

    executor = MigrationExecutor(connection)
    executor.migrate(executor.loader.graph.leaf_nodes())
