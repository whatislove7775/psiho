"""Анонимный баланс: журнал двойной записи, оплата созвонов, пополнения, коды, выплаты, права."""
import json
from datetime import timedelta
from unittest import mock

import pytest
from django.db import IntegrityError
from django.utils import timezone

from apps.billing import services as B
from apps.billing.ledger import InsufficientFunds, LedgerError, account_for, balance_of, post, system_account, verify
from apps.billing.models import Account, Entry, GiftCode, Hold, LedgerTransaction, PayoutRequest, TopUp
from apps.billing.providers import ProviderPayment, ProviderPayout
from apps.sessions.models import ConsultationSession, SessionEvent
from apps.staff.models import AuditLog, StaffMember
from apps.users.models import User

from .conftest import auth_client

K = Account.Kind


@pytest.fixture(autouse=True)
def _billing_settings(settings):
    settings.PLATFORM_FEE_PERCENT = 20.0
    settings.BILLING_FREE_CANCEL_HOURS = 24
    settings.BILLING_LATE_CANCEL_PENALTY_PERCENT = 50
    settings.BILLING_EARNINGS_HOLD_HOURS = 24
    settings.BILLING_PAYOUT_MIN_RUB = 500
    settings.BILLING_RECEIPTS_ENABLED = False
    settings.BILLING_MOCK_ENABLED = True
    settings.BILLING_WEBHOOK_IP_CHECK = True


def credit(user, rub: int):
    return B.adjust_client_balance(user, rub * 100, reason="тест", key=B.new_idempotency_key())


def make_call(client_user, psychologist, *, hours: float = 48, status="awaiting_payment", amount_rub=3000, minutes=50):
    s = ConsultationSession(
        client=client_user, psychologist_profile=psychologist, status=status,
        scheduled_at=timezone.now() + timedelta(hours=hours), duration_minutes=minutes, amount_kopecks=amount_rub * 100,
    )
    s.compute_split(20.0)
    s.save()
    return s


def assert_ledger_ok():
    check = verify()
    assert check["ok"], check


# ── Журнал ─────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_ledger_invariants_and_idempotency(client_user):
    acc = account_for(client_user, K.CLIENT)
    src = system_account(K.ADJUSTMENT)
    with pytest.raises(LedgerError):
        post("adjustment", "bad", [(acc, 100), (src, -99)])
    txn, created = post("adjustment", "k1", [(acc, 500), (src, -500)])
    again, created2 = post("adjustment", "k1", [(acc, 500), (src, -500)])
    assert created and not created2 and txn.pk == again.pk
    assert balance_of(client_user) == 500
    with pytest.raises(InsufficientFunds) as exc:
        post("adjustment", "k2", [(acc, -600), (src, 600)])
    assert exc.value.shortfall_kopecks == 100
    assert balance_of(client_user) == 500
    # Проводки неизменяемы
    with pytest.raises(PermissionError):
        Entry.objects.all().delete()
    with pytest.raises(PermissionError):
        LedgerTransaction.objects.update(memo="x")
    e = Entry.objects.first()
    with pytest.raises(PermissionError):
        e.save()
    assert_ledger_ok()


# ── Созвоны ────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_hold_capture_split_and_maturation(client_user, psychologist):
    credit(client_user, 5000)
    s = make_call(client_user, psychologist)
    hold = B.hold_for_call(s)
    assert B.hold_for_call(s).pk == hold.pk  # идемпотентно
    s.refresh_from_db()
    assert s.status == "paid"
    assert balance_of(client_user) == 2000_00 and balance_of(client_user, K.CLIENT_HOLD) == 3000_00
    assert s.events.filter(event_type="payment_confirmed").exists()

    # Завершение созвона → capture через сигнал
    s.status = "completed"
    s.save()
    hold.refresh_from_db()
    assert hold.status == "captured" and hold.specialist_kopecks == 2400_00 and hold.fee_kopecks == 600_00
    spec = psychologist.user
    assert balance_of(spec, K.SPEC_PENDING) == 2400_00
    assert balance_of(client_user, K.CLIENT_HOLD) == 0
    assert Account.objects.get(key="platform_fee:main").balance_kopecks == 600_00
    assert B.capture_for_call(s).status == "captured"  # повтор — ничего

    assert B.mature_earnings() == 0  # ещё рано
    assert B.mature_earnings(timezone.now() + timedelta(hours=25)) == 1
    assert balance_of(spec, K.SPEC_PENDING) == 0 and balance_of(spec, K.SPEC_AVAILABLE) == 2400_00
    assert_ledger_ok()


@pytest.mark.django_db
def test_insufficient_funds_then_topup_and_pay_via_api(client_user, psychologist):
    s = make_call(client_user, psychologist)
    c = auth_client(client_user)
    resp = c.post(f"/api/v1/billing/calls/{s.pk}/pay/")
    assert resp.status_code == 402 and resp.json()["code"] == "insufficient_funds"
    assert resp.json()["shortfall_kopecks"] == 3000_00
    info = c.get(f"/api/v1/billing/calls/{s.pk}/").json()
    assert info["payable"] and not info["paid"]

    # Пополнение через тестовую кассу
    t = c.post("/api/v1/billing/topups/", {"amount_rub": 3500}, format="json")
    assert t.status_code == 201, t.content
    assert t.json()["confirmation"]["url"].startswith("/app/balance/checkout")
    tid = t.json()["id"]
    done = c.post(f"/api/v1/billing/topups/{tid}/mock/", {"outcome": "succeeded"}, format="json")
    assert done.json()["status"] == "succeeded" and done.json()["balance_kopecks"] == 3500_00
    # повтор не зачисляет дважды
    c.post(f"/api/v1/billing/topups/{tid}/mock/", {"outcome": "succeeded"}, format="json")
    assert balance_of(client_user) == 3500_00

    resp = c.post(f"/api/v1/billing/calls/{s.pk}/pay/")
    assert resp.status_code == 200 and resp.json()["paid"] is True
    assert resp.json()["balance_kopecks"] == 500_00
    s.refresh_from_db()
    assert s.status == "paid"
    hist = c.get("/api/v1/billing/history/").json()
    assert [i["kind"] for i in hist["items"]][:2] == ["hold", "topup"]
    assert hist["holds"][0]["session_id"] == str(s.pk)
    assert_ledger_ok()


@pytest.mark.django_db
def test_topup_limits_and_other_users_topups(client_user, psychologist):
    c = auth_client(client_user)
    assert c.post("/api/v1/billing/topups/", {"amount_rub": 10}, format="json").status_code == 400
    assert c.post("/api/v1/billing/topups/", {"amount_rub": 1_000_000}, format="json").status_code == 400
    assert auth_client(psychologist.user).post("/api/v1/billing/topups/", {"amount_rub": 1000}, format="json").status_code == 403
    t = c.post("/api/v1/billing/topups/", {"amount_rub": "1 000,00"}, format="json").json()
    other = User.objects.create_anonymous_client("otherpass123")
    assert auth_client(other).post(f"/api/v1/billing/topups/{t['id']}/mock/", {"outcome": "succeeded"}, format="json").status_code == 404
    summary = c.get("/api/v1/billing/summary/").json()
    assert summary["topup"]["test_mode"] is True and summary["balance_kopecks"] == 0


@pytest.mark.django_db
def test_cancellation_rules(client_user, psychologist):
    credit(client_user, 20000)
    spec = psychologist.user
    # ≥ 24 ч до начала — бесплатно
    early = make_call(client_user, psychologist, hours=48)
    B.hold_for_call(early)
    h = B.release_for_call(early, "client_cancel")
    assert h.status == "released" and h.returned_kopecks == 3000_00

    # позже — штраф 50 % (специалисту 80 % штрафа, платформе 20 %)
    late = make_call(client_user, psychologist, hours=5)
    B.hold_for_call(late)
    h = B.release_for_call(late, "cancelled_by_client_late")  # форма из apps.dialogs
    assert h.status == "partial" and h.reason == "late_cancel"
    assert h.returned_kopecks == 1500_00 and h.specialist_kopecks == 1200_00 and h.fee_kopecks == 300_00
    assert balance_of(spec, K.SPEC_PENDING) == 1200_00

    # специалист отменил поздно — всё равно полный возврат
    s3 = make_call(client_user, psychologist, hours=2)
    B.hold_for_call(s3)
    assert B.release_for_call(s3, "cancelled_by_specialist").returned_kopecks == 3000_00

    # решение сотрудника перекрывает правила
    s4 = make_call(client_user, psychologist, hours=100)
    B.hold_for_call(s4)
    h = B.release_for_call(s4, "staff_penalty", penalty_percent=100)
    assert h.status == "captured" and h.specialist_kopecks == 2400_00
    assert balance_of(client_user) == 20000_00 - 1500_00 - 3000_00
    assert_ledger_ok()


@pytest.mark.django_db
def test_cancel_via_session_endpoint_releases_hold(client_user, psychologist):
    credit(client_user, 5000)
    s = make_call(client_user, psychologist, hours=72)
    B.hold_for_call(s)
    resp = auth_client(client_user).post(f"/api/v1/sessions/{s.pk}/cancel/")
    assert resp.status_code == 200, resp.content
    hold = Hold.objects.get(session_ref=s.pk)
    assert hold.status == "released"
    assert balance_of(client_user) == 5000_00
    assert_ledger_ok()


@pytest.mark.django_db
def test_session_event_signal_reasons(client_user, psychologist):
    """Отмена кодом без apps.dialogs: SessionEvent SESSION_ENDED(cancelled_by=…) → release."""
    credit(client_user, 10000)
    s = make_call(client_user, psychologist, hours=3, status="awaiting_payment")
    B.hold_for_call(s)
    s.status = "cancelled"
    s.save()
    SessionEvent.objects.create(session=s, event_type="session_ended", metadata={"cancelled_by": "client"})
    h = Hold.objects.get(session_ref=s.pk)
    assert h.status == "partial" and h.reason == "late_cancel"

    s2 = make_call(client_user, psychologist, hours=3)
    B.hold_for_call(s2)
    s2.status = "refunded"
    s2.save()
    SessionEvent.objects.create(session=s2, event_type="session_ended",
                                metadata={"cancelled_by": "staff", "refund": True})
    assert Hold.objects.get(session_ref=s2.pk).status == "released"
    assert_ledger_ok()


@pytest.mark.django_db
def test_sweep_no_shows_unpaid_and_overdue(client_user, psychologist):
    credit(client_user, 20000)
    past = timezone.now() - timedelta(hours=3)

    def paid_past(joined: set[str], n: int):
        s = make_call(client_user, psychologist, hours=48)
        B.hold_for_call(s)
        ConsultationSession.objects.filter(pk=s.pk).update(scheduled_at=past - timedelta(minutes=n * 7))
        s.refresh_from_db()
        if joined:
            s.status = "in_progress"
            s.save()
        for role in joined:
            SessionEvent.objects.create(session=s, event_type="participant_joined", metadata={"participant_role": role})
        return s

    nobody = paid_past(set(), 1)
    only_client = paid_past({"client"}, 2)
    only_spec = paid_past({"psychologist"}, 3)
    both = paid_past({"client", "psychologist"}, 4)
    # неоплаченная запись старше TTL освобождает время
    unpaid = make_call(client_user, psychologist, hours=30)
    ConsultationSession.objects.filter(pk=unpaid.pk).update(created_at=timezone.now() - timedelta(hours=1))

    result = B.sweep()
    assert result["unpaid_expired"] == 1 and result["calls_settled"] == 4
    reasons = {s.pk: Hold.objects.get(session_ref=s.pk) for s in (nobody, only_client, only_spec, both)}
    assert reasons[nobody.pk].status == "released" and reasons[nobody.pk].reason == "no_show_both"
    assert reasons[only_client.pk].status == "released" and reasons[only_client.pk].reason == "specialist_no_show"
    assert reasons[only_spec.pk].status == "captured" and reasons[only_spec.pk].reason == "client_no_show"
    assert reasons[both.pk].status == "captured"
    both.refresh_from_db()
    unpaid.refresh_from_db()
    assert both.status == "completed" and unpaid.status == "cancelled"
    assert B.sweep()["calls_settled"] == 0
    assert_ledger_ok()


@pytest.mark.django_db
def test_booking_pays_from_balance_or_waits(psychologist, client_user):
    from .test_sessions import iso, msk

    day = timezone.now().date() + timedelta(days=3)
    c = auth_client(client_user)
    payload = {"psychologist_id": psychologist.id, "scheduled_at": iso(msk(day, 10)), "duration_minutes": 50}
    r = c.post("/api/v1/sessions/book/", payload, format="json")
    assert r.status_code == 201, r.content
    assert r.json()["status"] == "awaiting_payment"
    assert r.json()["payment_url"] == f"/app/balance/pay/{r.json()['id']}"

    credit(client_user, 5000)
    r2 = c.post("/api/v1/sessions/book/", {**payload, "scheduled_at": iso(msk(day, 11))}, format="json")
    assert r2.status_code == 201 and r2.json()["status"] == "paid" and r2.json()["payment_url"] is None
    assert balance_of(client_user) == 2000_00
    q = c.get(f"/api/v1/billing/quote/?psychologist={psychologist.id}&minutes=50").json()
    assert q == {"amount_kopecks": 3000_00, "balance_kopecks": 2000_00, "enough": False, "shortfall_kopecks": 1000_00,
                 "company_kopecks": 0}


# ── Вебхук ЮKassa ──────────────────────────────────────────────────

YK_IP = "185.71.76.5"


@pytest.mark.django_db
def test_yookassa_topup_webhook_verifies_and_is_idempotent(client_user, settings):
    settings.YOOKASSA_SHOP_ID, settings.YOOKASSA_SECRET_KEY = "shop", "key"
    settings.BILLING_MOCK_ENABLED = False
    settings.BILLING_RECEIPTS_ENABLED = True
    c = auth_client(client_user)
    created = {"id": "yk-1", "status": "pending", "amount": {"value": "1000.00"},
               "confirmation": {"type": "redirect", "confirmation_url": "https://yoomoney.ru/checkout/x"}}
    with mock.patch("apps.billing.providers.YooKassaClient.request", return_value=created) as req:
        r = c.post("/api/v1/billing/topups/", {"amount_rub": 1000, "method": "sbp", "receipt_email": "a@b.ru"}, format="json")
    assert r.status_code == 201, r.content
    body = req.call_args[0][2]
    assert body["payment_method_data"] == {"type": "sbp"} and body["receipt"]["customer"] == {"email": "a@b.ru"}
    assert body["amount"]["value"] == "1000.00" and "alias" not in json.dumps(body)
    t = TopUp.objects.get()
    assert t.provider_payment_id == "yk-1" and t.with_receipt
    assert "a@b.ru" not in json.dumps(list(TopUp.objects.values()), default=str)  # контакт для чека не хранится

    hook = {"type": "notification", "event": "payment.succeeded", "object": {"id": "yk-1", "status": "succeeded"}}
    # чужой IP
    assert c.post("/api/v1/billing/webhook/yookassa/", hook, format="json", REMOTE_ADDR="1.2.3.4").status_code == 403
    # тело говорит succeeded, API — canceled → верим API
    remote = {"id": "yk-1", "status": "canceled", "amount": {"value": "1000.00"}, "metadata": {"topup_id": str(t.id)}}
    with mock.patch("apps.billing.providers.YooKassaClient.request", return_value=remote):
        assert c.post("/api/v1/billing/webhook/yookassa/", hook, format="json", REMOTE_ADDR=YK_IP).status_code == 200
    t.refresh_from_db()
    assert t.status == "canceled" and balance_of(client_user) == 0

    t2 = TopUp.objects.create(user=client_user, user_ref=str(client_user.pk), provider="yookassa",
                              provider_payment_id="yk-2", amount_kopecks=2000_00)
    remote = {"id": "yk-2", "status": "succeeded", "amount": {"value": "2000.00"}, "metadata": {"topup_id": str(t2.id)}}
    hook["object"]["id"] = "yk-2"
    with mock.patch("apps.billing.providers.YooKassaClient.request", return_value=remote):
        for _ in range(3):  # повторы доставки
            assert c.post("/api/v1/billing/webhook/yookassa/", hook, format="json", REMOTE_ADDR=YK_IP).status_code == 200
    assert balance_of(client_user) == 2000_00
    # сумма не совпадает → не зачисляем, 502 (ЮKassa повторит)
    t3 = TopUp.objects.create(user=client_user, user_ref=str(client_user.pk), provider="yookassa",
                              provider_payment_id="yk-3", amount_kopecks=500_00)
    hook["object"]["id"] = "yk-3"
    remote = {"id": "yk-3", "status": "succeeded", "amount": {"value": "50000.00"}, "metadata": {"topup_id": str(t3.id)}}
    with mock.patch("apps.billing.providers.YooKassaClient.request", return_value=remote):
        assert c.post("/api/v1/billing/webhook/yookassa/", hook, format="json", REMOTE_ADDR=YK_IP).status_code == 502
    assert balance_of(client_user) == 2000_00
    # тестовая касса выключена, когда есть ключи и BILLING_MOCK_ENABLED=false
    assert c.post("/api/v1/billing/topups/", {"amount_rub": 1000, "provider": "mock"}, format="json").status_code == 400
    assert_ledger_ok()


# ── Подарочные коды ────────────────────────────────────────────────

@pytest.mark.django_db
def test_gift_codes(client_user, admin_user):
    batch, codes = B.generate_gift_batch(amount_kopecks=1500_00, count=3, label="Партнёр", by=admin_user)
    assert len(codes) == 3 and all(c.startswith("APR-") for c in codes)
    assert not GiftCode.objects.filter(code_hash__in=codes).exists()  # в базе только HMAC
    c = auth_client(client_user)
    r = c.post("/api/v1/billing/redeem/", {"code": codes[0].lower().replace("-", " ")}, format="json")
    assert r.status_code == 200 and r.json()["balance_kopecks"] == 1500_00
    r = c.post("/api/v1/billing/redeem/", {"code": codes[0]}, format="json")
    assert r.status_code == 400 and "уже использован" in r.json()["detail"]
    assert c.post("/api/v1/billing/redeem/", {"code": "APR-AAAA-BBBB-CCCC"}, format="json").status_code == 400
    B.revoke_gift_batch(batch)
    assert c.post("/api/v1/billing/redeem/", {"code": codes[1]}, format="json").status_code == 400
    assert balance_of(client_user) == 1500_00
    assert_ledger_ok()


@pytest.mark.django_db
def test_gift_redeem_is_rate_limited(client_user):
    c = auth_client(client_user)
    codes = [c.post("/api/v1/billing/redeem/", {"code": f"APR-XXXX-XXXX-XXX{i}"}, format="json").status_code
             for i in range(7)]
    assert 429 in codes


# ── Выплаты ────────────────────────────────────────────────────────

def earn(client_user, psychologist, rub=3000):
    credit(client_user, rub)
    s = make_call(client_user, psychologist, amount_rub=rub)
    B.hold_for_call(s)
    B.capture_for_call(s)
    B.mature_earnings(timezone.now() + timedelta(days=2))
    return s


@pytest.mark.django_db
def test_payout_manual_flow_and_encryption(client_user, psychologist, admin_user):
    spec = psychologist.user
    earn(client_user, psychologist)  # 2400 ₽ доступно
    p = auth_client(spec)
    assert p.post("/api/v1/billing/earnings/payouts/", {}, format="json").status_code == 400  # нет реквизитов
    r = p.put("/api/v1/billing/earnings/method/", {
        "kind": "sbp", "phone": "8 (912) 345-67-89", "bank_name": "Т-Банк", "tax_status": "self_employed",
    }, format="json")
    assert r.status_code == 200 and "67-89" in r.json()["masked"] and "912" not in r.json()["masked"]
    from apps.billing.models import PayoutMethod

    raw = bytes(PayoutMethod.objects.get(user=spec).encrypted)
    assert b"79123456789" not in raw and b"\xd0\xa2-\xd0\x91" not in raw

    assert p.post("/api/v1/billing/earnings/payouts/", {"amount_rub": 100}, format="json").status_code == 400  # < минимума
    assert p.post("/api/v1/billing/earnings/payouts/", {"amount_rub": 5000}, format="json").status_code == 400  # > доступного
    r = p.post("/api/v1/billing/earnings/payouts/", {}, format="json")
    assert r.status_code == 201 and r.json()["amount_kopecks"] == 2400_00 and r.json()["rail"] == "manual"
    assert p.post("/api/v1/billing/earnings/payouts/", {}, format="json").status_code == 400  # уже есть открытая
    e = p.get("/api/v1/billing/earnings/").json()
    assert e["available_kopecks"] == 0 and e["in_payout_kopecks"] == 2400_00
    assert e["calls"][0]["client_alias"] == client_user.alias and e["calls"][0]["fee_kopecks"] == 600_00

    a = auth_client(admin_user)
    pid = r.json()["id"]
    d = a.post(f"/api/v1/billing/staff/payouts/{pid}/details/")
    assert d.status_code == 200 and d.json()["details"]["phone"] == "79123456789"
    assert AuditLog.objects.filter(action="finance.payout.details_view").exists()
    assert a.post(f"/api/v1/billing/staff/payouts/{pid}/paid/", {}, format="json").json()["status"] == "paid"
    assert a.post(f"/api/v1/billing/staff/payouts/{pid}/paid/", {}, format="json").status_code == 400
    e = p.get("/api/v1/billing/earnings/").json()
    assert e["paid_kopecks"] == 2400_00 and e["in_payout_kopecks"] == 0
    assert AuditLog.objects.filter(action="finance.payout.paid").exists()
    assert_ledger_ok()


@pytest.mark.django_db
def test_payout_reject_and_yookassa_rail(client_user, psychologist, admin_user, settings):
    spec = psychologist.user
    earn(client_user, psychologist)
    B.set_payout_method(spec, kind="sbp", tax_status="self_employed",
                        details={"phone": "+79123456789", "bank_name": "Сбер", "bank_id": "100000000111"})
    payout = B.request_payout(spec)
    B.reject_payout(payout, by=admin_user, note="Проверьте номер")
    assert balance_of(spec, K.SPEC_AVAILABLE) == 2400_00

    settings.YOOKASSA_PAYOUT_AGENT_ID, settings.YOOKASSA_PAYOUT_SECRET_KEY = "agent", "secret"
    payout = B.request_payout(spec, 1000_00)
    assert payout.rail == "yookassa"
    sent = {"id": "po-1", "status": "pending", "amount": {"value": "1000.00"}}
    with mock.patch("apps.billing.providers.YooKassaClient.request", return_value=sent) as req:
        payout = B.approve_payout(payout, by=admin_user)
    body = req.call_args[0][2]
    assert body["payout_destination_data"] == {"type": "sbp", "phone": "79123456789", "bank_id": "100000000111"}
    assert payout.status == "processing" and payout.provider_payout_id == "po-1"
    hook = {"event": "payout.succeeded", "object": {"id": "po-1"}}
    with mock.patch("apps.billing.providers.YooKassaClient.request", return_value={"id": "po-1", "status": "succeeded"}):
        r = auth_client(client_user).post("/api/v1/billing/webhook/yookassa/", hook, format="json", REMOTE_ADDR=YK_IP)
    assert r.status_code == 200
    payout.refresh_from_db()
    assert payout.status == "paid" and balance_of(spec, K.SPEC_AVAILABLE) == 1400_00
    assert_ledger_ok()


@pytest.mark.django_db
def test_staff_refund_of_captured_call_and_topup_refund(client_user, psychologist, admin_user):
    s = earn(client_user, psychologist)
    h = B.refund_captured_call(s, by=admin_user)
    assert h.status == "refunded" and balance_of(client_user) == 3000_00
    assert balance_of(psychologist.user, K.SPEC_AVAILABLE) == 0
    with pytest.raises(B.BillingError):
        B.refund_captured_call(s)

    t = B.create_topup(client_user, 1000_00, provider="mock")
    B.mock_checkout(t, "succeeded")
    a = auth_client(admin_user)
    r = a.post(f"/api/v1/billing/staff/topups/{t.pk}/refund/")
    assert r.status_code == 200 and r.json()["status"] == "refunded"
    assert balance_of(client_user) == 3000_00
    assert_ledger_ok()


# ── Права и админка ────────────────────────────────────────────────

def make_staff(role):
    user = User.objects.create_user(alias=f"fin-{role}", password="staffpass12345", role="admin")
    StaffMember.objects.create(user=user, role=role)
    return user


@pytest.mark.django_db
def test_finance_permissions(client_user, psychologist, admin_user):
    support = make_staff("support")
    for path in ("/api/v1/billing/staff/overview/", "/api/v1/billing/staff/payouts/", "/api/v1/billing/staff/balances/"):
        assert auth_client(admin_user).get(path).status_code == 200, path
        assert auth_client(support).get(path).status_code == 403
        assert auth_client(client_user).get(path).status_code == 403
    admin = make_staff("admin")
    assert auth_client(admin).get("/api/v1/billing/staff/overview/").status_code == 200
    moderator = make_staff("moderator")
    r = auth_client(moderator).post("/api/v1/billing/staff/adjust/", {"alias": client_user.alias, "amount_rub": 100,
                                                                      "reason": "x", "key": "k" * 10}, format="json")
    assert r.status_code == 403

    a = auth_client(admin_user)
    key = "adjust-key-1"
    for _ in range(2):  # двойной клик — одна операция
        r = a.post("/api/v1/billing/staff/adjust/", {"alias": client_user.alias, "amount_rub": 700,
                                                    "reason": "Возврат за сбой связи", "key": key}, format="json")
        assert r.status_code == 200, r.content
    assert balance_of(client_user) == 700_00
    bal = a.get(f"/api/v1/billing/staff/balances/?q={client_user.alias[:5]}").json()["items"]
    assert bal[0]["alias"] == client_user.alias and set(bal[0]) == {"user_id", "alias", "balance_kopecks", "held_kopecks"}

    g = a.post("/api/v1/billing/staff/gifts/", {"amount_rub": 1000, "count": 2, "label": "Тест"}, format="json")
    assert g.status_code == 201 and len(g.json()["codes"]) == 2
    assert a.get("/api/v1/billing/staff/gifts/").json()["items"][0]["count"] == 2
    ov = a.get("/api/v1/billing/staff/overview/").json()
    assert ov["clients_kopecks"] == 700_00 and ov["gifts_outstanding_kopecks"] == 2000_00 and ov["ledger_ok"]
    rec = a.get("/api/v1/billing/staff/reconcile/").json()
    assert rec["ledger"]["ok"] and rec["provider"]["checked"] is False
    assert AuditLog.objects.filter(action="finance.adjust").count() == 2
    csv = a.get("/api/v1/billing/staff/export/?days=7")
    assert csv.status_code == 200 and "Корректировка" in csv.content.decode()


@pytest.mark.django_db
def test_user_deletion_keeps_ledger_balanced(client_user, psychologist):
    from apps.users.services import delete_user_completely

    earn(client_user, psychologist)
    credit(client_user, 100)
    delete_user_completely(client_user)
    assert Hold.objects.get().session is None
    assert_ledger_ok()
