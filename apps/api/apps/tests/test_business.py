"""B2B: коды сотрудников, порядок оплаты (компания → личный баланс), k-анонимность, права."""
import json
import uuid
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.billing import services as B
from apps.billing.ledger import balance_of, verify
from apps.billing.models import Account
from apps.business import services as svc
from apps.business.core import add_months, month_start
from apps.business.funding import budget_balance
from apps.business.models import Charge, Company, CompanyAdmin, EmployeeCode, Enrollment, Lead
from apps.sessions.models import ConsultationSession
from apps.staff.models import AuditLog, StaffMember
from apps.users.models import User

from .conftest import auth_client

K = Account.Kind


@pytest.fixture(autouse=True)
def _billing_settings(settings):
    settings.PLATFORM_FEE_PERCENT = 20.0
    settings.BILLING_FREE_CANCEL_HOURS = 24
    settings.BILLING_LATE_CANCEL_PENALTY_PERCENT = 50
    settings.BILLING_MOCK_ENABLED = True
    settings.BUSINESS_K_ANONYMITY = 5


def make_company(budget_rub=100_000, *, amount_rub=5000, calls_limit=None, services=("calls",), name="Ромашка"):
    c = Company.objects.create(name=name)
    program = svc.create_program(c, {"name": "Забота", "amount_rub": amount_rub, "calls_limit": calls_limit,
                                     "services": list(services), "period": "month"})
    if budget_rub:
        inv = svc.issue_invoice(c, budget_rub * 100)
        svc.mark_invoice_paid(inv)
    return c, program


def codes_for(c, program, n=1):
    return svc.generate_codes(c, program, count=n)[1]


def make_call(client, psychologist, *, hours=48, amount_rub=3000):
    s = ConsultationSession(client=client, psychologist_profile=psychologist, status="awaiting_payment",
                            scheduled_at=timezone.now() + timedelta(hours=hours), duration_minutes=50,
                            amount_kopecks=amount_rub * 100)
    s.compute_split(20.0)
    s.save()
    return s


def credit(user, rub):
    B.adjust_client_balance(user, rub * 100, reason="тест", key=B.new_idempotency_key())


def hr_client(company, login="hr-romashka", must_change=False):
    admin, _ = svc.invite_admin(company, login=login)
    admin.must_change_password = must_change
    admin.save()
    return auth_client(admin.user), admin


def assert_ledger_ok():
    check = verify()
    assert check["ok"], check


# ── Коды ───────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_code_redeems_once_and_is_not_linked_to_account(client_user):
    c, p = make_company()
    code = codes_for(c, p)[0]
    api = auth_client(client_user)
    r = api.post("/api/v1/business/redeem/", {"code": code.lower()}, format="json")
    assert r.status_code == 201, r.content
    assert r.json()["programs"][0]["company"] == "Ромашка"
    assert r.json()["programs"][0]["rub_left_kopecks"] == 500000
    # Второй раз тот же код — нельзя (ни тому же, ни другому аккаунту)
    other = User.objects.create_anonymous_client("otherpass123")
    r2 = auth_client(other).post("/api/v1/business/redeem/", {"code": code}, format="json")
    assert r2.status_code == 400 and "уже использован" in r2.json()["detail"]
    # Код не хранит, кто его погасил
    fields = {f.name for f in EmployeeCode._meta.get_fields()}
    assert not ({"redeemed_by", "redeemed_at", "user"} & fields)
    enr = Enrollment.objects.get(user=client_user)
    assert enr.joined_month == month_start() and not hasattr(enr, "code")
    # Второй код той же компании тому же аккаунту — не нужен
    code2 = codes_for(c, p)[0]
    r3 = api.post("/api/v1/business/redeem/", {"code": code2}, format="json")
    assert r3.status_code == 400
    assert EmployeeCode.objects.filter(status="active").count() == 1


@pytest.mark.django_db
def test_revoked_codes_and_identical_revoke_response(client_user):
    c, p = make_company()
    used, unused = codes_for(c, p, 2)
    auth_client(client_user).post("/api/v1/business/redeem/", {"code": used}, format="json")
    hr, _ = hr_client(c)
    r1 = hr.post("/api/v1/business/portal/codes/revoke/", {"code": used}, format="json")
    r2 = hr.post("/api/v1/business/portal/codes/revoke/", {"code": unused}, format="json")
    assert r1.status_code == r2.status_code == 200 and r1.json() == r2.json()
    assert Enrollment.objects.get(user=client_user).status == "ended"
    other = User.objects.create_anonymous_client("otherpass123")
    r = auth_client(other).post("/api/v1/business/redeem/", {"code": unused}, format="json")
    assert r.status_code == 400 and "не действует" in r.json()["detail"]


@pytest.mark.django_db
def test_hr_or_specialist_cannot_redeem(psychologist):
    c, p = make_company()
    code = codes_for(c, p)[0]
    hr, _ = hr_client(c)
    assert hr.post("/api/v1/business/redeem/", {"code": code}, format="json").status_code == 403
    assert auth_client(psychologist.user).post("/api/v1/business/redeem/", {"code": code}, format="json").status_code == 403


# ── Порядок оплаты ────────────────────────────────────────────────

@pytest.mark.django_db
def test_allowance_pays_first_then_personal_balance(client_user, psychologist):
    c, p = make_company(budget_rub=100_000, amount_rub=5000)
    svc.redeem(client_user, codes_for(c, p)[0])
    credit(client_user, 10_000)
    start_budget = budget_balance(c)

    s1 = make_call(client_user, psychologist)
    B.hold_for_call(s1)
    assert balance_of(client_user) == 10_000 * 100  # целиком за счёт компании
    assert budget_balance(c) == start_budget - 3000 * 100

    s2 = make_call(client_user, psychologist, hours=72)
    q = auth_client(client_user).get(f"/api/v1/billing/calls/{s2.pk}/").json()
    assert q["company_kopecks"] == 2000 * 100
    B.hold_for_call(s2)  # 2000 — компания (остаток лимита), 1000 — личные
    assert balance_of(client_user) == 9000 * 100
    assert budget_balance(c) == start_budget - 5000 * 100

    s3 = make_call(client_user, psychologist, hours=96)
    B.hold_for_call(s3)  # лимит исчерпан — всё с личного
    assert balance_of(client_user) == 6000 * 100
    assert budget_balance(c) == start_budget - 5000 * 100
    assert not Charge.objects.filter(ref=s3.pk).exists()

    # Отмена второго созвона: возвращаем в обратном порядке — сначала личные 1000, потом компании 2000
    B.release_for_call(s2, "specialist_cancel")
    assert balance_of(client_user) == 7000 * 100
    assert budget_balance(c) == start_budget - 3000 * 100
    assert Charge.objects.get(ref=s2.pk).status == "returned"
    # Первый состоялся — списан с бюджета, остаётся в расходах
    B.capture_for_call(s1)
    ch = Charge.objects.get(ref=s1.pk)
    assert ch.status == "settled" and ch.net_kopecks == 3000 * 100
    assert_ledger_ok()


@pytest.mark.django_db
def test_calls_limit_and_late_cancel_and_refund(client_user, psychologist):
    c, p = make_company(amount_rub=None, calls_limit=1)
    svc.redeem(client_user, codes_for(c, p)[0])
    credit(client_user, 5000)
    s1 = make_call(client_user, psychologist, hours=5)
    B.hold_for_call(s1)
    assert balance_of(client_user) == 5000 * 100
    s2 = make_call(client_user, psychologist, hours=50)
    assert auth_client(client_user).get(f"/api/v1/billing/calls/{s2.pk}/").json()["company_kopecks"] == 0
    # Поздняя отмена клиентом: штраф 50% уходит специалисту из денег компании, остаток — компании
    before = budget_balance(c)
    B.release_for_call(s1, "client_cancel")
    assert budget_balance(c) == before + 1500 * 100
    assert balance_of(client_user) == 5000 * 100
    # Сотрудник возвращает и удержанное — оно тоже уходит компании
    B.refund_captured_call(s1)
    assert budget_balance(c) == before + 3000 * 100
    assert Charge.objects.get(ref=s1.pk).status == "returned"
    assert_ledger_ok()


@pytest.mark.django_db
def test_budget_runs_out_and_personal_covers_rest(client_user, psychologist):
    c, p = make_company(budget_rub=10_000, amount_rub=50_000)
    svc.adjust_budget(c, -8000 * 100, reason="тест", key="x1")  # осталось 2000 ₽
    svc.redeem(client_user, codes_for(c, p)[0])
    credit(client_user, 500)
    s = make_call(client_user, psychologist)
    with pytest.raises(B.InsufficientFunds):
        B.hold_for_call(s)  # 2000 компании + 500 личных < 3000
    assert budget_balance(c) == 2000 * 100 and not Charge.objects.exists()
    credit(client_user, 1000)
    B.hold_for_call(s)
    assert budget_balance(c) == 0 and balance_of(client_user) == 500 * 100
    assert_ledger_ok()


@pytest.mark.django_db
def test_paused_company_or_ended_enrollment_does_not_pay(client_user, psychologist):
    c, p = make_company()
    svc.redeem(client_user, codes_for(c, p)[0])
    credit(client_user, 5000)
    c.status = Company.Status.PAUSED
    c.save()
    s = make_call(client_user, psychologist)
    B.hold_for_call(s)
    assert balance_of(client_user) == 2000 * 100


# ── k-анонимность и отсутствие утечек ─────────────────────────────

def seed_usage(company, program, people: int, month, psychologist=None, per_person=1, topic="anxiety"):
    for i in range(people):
        u = User.objects.create_anonymous_client(f"emp-pass-{uuid.uuid4().hex[:8]}")
        enr = Enrollment.objects.create(user=u, company=company, program=program, code_ref=uuid.uuid4().hex,
                                        joined_month=add_months(month, -1))
        for _ in range(per_person):
            Charge.objects.create(company=company, program=program, enrollment=enr, ref=uuid.uuid4(),
                                  covered_kopecks=300000, status="settled", period_month=month, topic=topic, minutes=50)


@pytest.mark.django_db
def test_k_anonymity_thresholds():
    c, p = make_company()
    prev = add_months(month_start(), -1)
    prev2 = add_months(month_start(), -2)
    seed_usage(c, p, 4, prev2)
    seed_usage(c, p, 5, prev, topic="anxiety")
    hr, _ = hr_client(c)
    d = hr.get("/api/v1/business/portal/dashboard/").json()
    rows = {r["month"]: r for r in d["monthly"]}
    assert rows[prev.isoformat()]["people"] == 5 and rows[prev.isoformat()]["calls"] == 5
    assert rows[prev2.isoformat()]["people"] is None and rows[prev2.isoformat()]["calls"] is None
    assert rows[prev2.isoformat()]["hours"] is None
    assert rows[prev2.isoformat()]["spent_kopecks"] == 4 * 300000  # суммы — для актов — видны
    assert d["k_min"] == 5
    # Тема видна: 9 человек с «тревогой»
    assert d["topics"]["visible"] and d["topics"]["rows"][0]["topic"] == "anxiety"
    # Оценки: никто не оставлял — скрыто
    assert d["satisfaction"]["average"] is None
    # Текущий месяц не раскрывается
    seed_usage(c, p, 6, month_start())
    d2 = hr.get("/api/v1/business/portal/dashboard/").json()
    assert month_start().isoformat() not in {r["month"] for r in d2["monthly"]}
    assert d2["totals"]["people"] == 9


@pytest.mark.django_db
def test_small_topics_are_merged_and_small_totals_hidden():
    c, p = make_company()
    prev = add_months(month_start(), -1)
    seed_usage(c, p, 5, prev, topic="anxiety")
    seed_usage(c, p, 2, prev, topic="relations")
    hr, _ = hr_client(c)
    t = hr.get("/api/v1/business/portal/dashboard/").json()["topics"]
    assert [r["topic"] for r in t["rows"]] == ["anxiety"]
    assert t["other_share"] > 0
    c2, p2 = make_company(name="Малая")
    seed_usage(c2, p2, 3, prev)
    hr2, _ = hr_client(c2, login="hr-small")
    d = hr2.get("/api/v1/business/portal/dashboard/").json()
    assert d["topics"]["visible"] is False and d["totals"]["people"] is None and d["codes"]["activated"] is None


@pytest.mark.django_db
def test_no_per_employee_data_in_company_endpoints(client_user, psychologist):
    c, p = make_company()
    code = codes_for(c, p, 3)[0]
    svc.redeem(client_user, code)
    credit(client_user, 1000)
    s = make_call(client_user, psychologist)
    B.hold_for_call(s)
    B.capture_for_call(s)
    prev = add_months(month_start(), -1)
    seed_usage(c, p, 6, prev)
    hr, _ = hr_client(c)
    batch_id = hr.get("/api/v1/business/portal/codes/").json()["batches"][0]["id"]
    endpoints = ["me/", "dashboard/", "codes/", "program/", "documents/"]
    blob = ""
    for ep in endpoints:
        r = hr.get(f"/api/v1/business/portal/{ep}")
        assert r.status_code == 200, (ep, r.content)
        blob += json.dumps(r.json(), ensure_ascii=False)
    blob += hr.get("/api/v1/business/portal/documents/acts.csv").content.decode()
    export = hr.get(f"/api/v1/business/portal/codes/{batch_id}/export/").content.decode()
    aliases = list(User.objects.filter(role="client").values_list("alias", flat=True))
    ids = [str(x) for x in User.objects.filter(role="client").values_list("id", flat=True)]
    for needle in aliases + ids + [psychologist.display_name, str(s.pk), str(Enrollment.objects.first().id)]:
        assert needle not in blob, needle
        assert needle not in export
    # Никаких статусов по отдельным кодам и точных дат
    assert "used" not in export and "active" not in export
    assert "redeemed_at" not in blob and "scheduled_at" not in blob
    assert code in export


# ── Права ─────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_portal_permissions(client_user, psychologist):
    c, _ = make_company()
    other, _ = make_company(name="Чужая")
    assert auth_client(client_user).get("/api/v1/business/portal/dashboard/").status_code == 403
    assert auth_client(psychologist.user).get("/api/v1/business/portal/dashboard/").status_code == 403
    hr, admin = hr_client(c, must_change=True)
    r = hr.get("/api/v1/business/portal/dashboard/")
    assert r.status_code == 403 and r.json()["code"] == "password_change_required"
    assert hr.get("/api/v1/business/portal/me/").status_code == 200
    r = hr.post("/api/v1/business/portal/me/password/", {"old_password": "wrong", "new_password": "Str0ng-pass-2026"}, format="json")
    assert r.status_code == 400
    admin.user.set_password("temp-pass-123")
    admin.user.save()
    r = hr.post("/api/v1/business/portal/me/password/", {"old_password": "temp-pass-123", "new_password": "Str0ng-pass-2026"}, format="json")
    assert r.status_code == 200
    assert hr.get("/api/v1/business/portal/dashboard/").json()["company"]["name"] == "Ромашка"
    # HR видит только свою компанию: чужая партия кодов — 404
    batch, _ = svc.generate_codes(other, other.programs.first(), count=2)
    assert hr.get(f"/api/v1/business/portal/codes/{batch.id}/export/").status_code == 404
    assert hr.post(f"/api/v1/business/portal/codes/{batch.id}/revoke/").status_code == 404
    # HR не может в админку персонала
    assert hr.get("/api/v1/business/staff/companies/").status_code == 403
    # Отключённый HR
    admin.is_active = False
    admin.save()
    assert hr.get("/api/v1/business/portal/me/").status_code == 403


@pytest.mark.django_db
def test_staff_console_permissions_and_audit(admin_user):
    support = User.objects.create_user(alias="support1", password="supportpass123", role=User.Role.ADMIN)
    StaffMember.objects.create(user=support, role="support")
    assert auth_client(support).get("/api/v1/business/staff/companies/").status_code == 403
    api = auth_client(admin_user)
    r = api.post("/api/v1/business/staff/companies/", {
        "name": "Ромашка", "inn": "7700000000", "plan": "standard",
        "program": {"amount_rub": 6000, "services": ["calls"], "period": "quarter"},
    }, format="json")
    assert r.status_code == 201, r.content
    cid = r.json()["company"]["id"]
    assert r.json()["programs"][0]["period"] == "quarter"
    r = api.post(f"/api/v1/business/staff/companies/{cid}/admins/", {"login": "hr-romashka", "full_name": "Ирина"}, format="json")
    assert r.status_code == 201 and r.json()["one_time_password"]
    hr_user = User.objects.get(alias="hr-romashka")
    assert hr_user.role == "business" and CompanyAdmin.objects.get(user=hr_user).must_change_password
    login = auth_client(hr_user)  # noqa: F841
    r = api.post(f"/api/v1/business/staff/companies/{cid}/invoices/", {"amount_rub": 150000}, format="json")
    inv = r.json()["invoice"]["id"]
    r = api.post(f"/api/v1/business/staff/invoices/{inv}/paid/")
    assert r.status_code == 200 and r.json()["budget_kopecks"] == 150000 * 100
    assert api.post(f"/api/v1/business/staff/invoices/{inv}/paid/").status_code == 400  # дважды нельзя
    actions = set(AuditLog.objects.values_list("action", flat=True))
    assert {"business.company.create", "business.hr.invite", "business.invoice.issue", "business.invoice.paid"} <= actions
    assert_ledger_ok()


@pytest.mark.django_db
def test_public_lead_and_hr_login(api, admin_user):
    r = api.post("/api/v1/business/leads/", {"company_name": "Ромашка", "contact": "hr@romashka.ru", "employees": 300},
                 format="json")
    assert r.status_code == 201 and Lead.objects.count() == 1
    assert api.post("/api/v1/business/leads/", {"company_name": "X", "contact": "no"}, format="json").status_code == 400
    leads = auth_client(admin_user).get("/api/v1/business/staff/leads/").json()["results"]
    assert leads[0]["company_name"] == "Ромашка"
    c, _ = make_company()
    admin, password = svc.invite_admin(c, login="hr-login")
    r = api.post("/api/v1/auth/login/", {"login": "hr-login", "password": password}, format="json")
    assert r.status_code == 200 and r.json()["user"]["role"] == "business"
