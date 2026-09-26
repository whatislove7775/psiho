"""
Анонимный баланс: оплата созвонов, пополнения, подарочные коды, выплаты.

Контракт с диалогами (C1):
    quote_call(psychologist, minutes) -> Decimal            # цена в рублях
    hold_for_call(session) -> Hold                          # заморозить; InsufficientFunds, если не хватает
    capture_for_call(session) -> Hold | None                # созвон состоялся: специалисту и комиссия
    release_for_call(session, reason) -> Hold | None        # вернуть по правилам отмены

Жизненный цикл созвона подключён через сигналы (signals.py): завершение → capture,
отмена (SessionEvent SESSION_ENDED с cancelled_by) → release. Неявки, «зависшие»
созвоны и неоплаченные записи разбирает sweep() (команда billing_sweep, сервис scheduler).
"""
from __future__ import annotations

import logging
import secrets
import uuid
from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.core.cache import cache
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from . import conf
from .crypto import code_hash, decrypt_json, encrypt_json
from .ledger import InsufficientFunds, LedgerError, account_for, balance_of, post, system_account
from .models import (
    Account, GiftBatch, GiftCode, Hold, LedgerTransaction, PayoutMethod, PayoutRequest, TopUp, WebhookEvent,
)
from .providers import (
    METHODS, ProviderError, ProviderPayment, available_providers, default_payout_rail, get_payout_rail, get_provider,
)

logger = logging.getLogger(__name__)
K = Account.Kind
T = LedgerTransaction.Kind
HS = Hold.Status

__all__ = [
    "BillingError", "InsufficientFunds", "quote_call", "hold_for_call", "capture_for_call", "release_for_call",
]


class BillingError(Exception):
    """Понятная пользователю ошибка (текст — по-русски)."""


# ── Созвоны ───────────────────────────────────────────────────────

def quote_call(psychologist, minutes: int) -> Decimal:
    """Цена созвона в рублях: ставка за час × минуты / 60, округление до 10 ₽ (apps.availability)."""
    from apps.availability.services import price_for

    return Decimal(price_for(psychologist, int(minutes)))


def split_fee(amount_kopecks: int) -> tuple[int, int]:
    """(доля специалиста, комиссия платформы) в копейках."""
    fee = int((Decimal(amount_kopecks) * conf.platform_fee_percent() / 100).quantize(Decimal("1"), ROUND_HALF_UP))
    fee = max(0, min(fee, amount_kopecks))
    return amount_kopecks - fee, fee


def _session_model():
    from apps.sessions.models import ConsultationSession

    return ConsultationSession


def _hold_of(session_or_id, lock: bool = False) -> Hold | None:
    sid = getattr(session_or_id, "pk", session_or_id)
    qs = Hold.objects.filter(session_ref=sid)
    if lock:
        qs = qs.select_for_update()
    return qs.first()


def hold_for_call(session) -> Hold:
    """Замораживает стоимость созвона на балансе клиента и помечает запись оплаченной.

    Идемпотентно: повторный вызов возвращает существующую заморозку.
    InsufficientFunds — денег не хватает (UI предлагает пополнить).
    """
    from apps.payments.services import mark_session_paid

    S = _session_model().Status
    with transaction.atomic():
        session = _session_model().objects.select_for_update().select_related("psychologist_profile").get(pk=session.pk)
        hold = _hold_of(session, lock=True)
        if hold is not None:
            if hold.status == HS.ACTIVE or hold.status == HS.CAPTURED:
                if session.status in (S.DRAFT, S.AWAITING_PAYMENT):
                    mark_session_paid(session, {"mode": "balance"})
                return hold
            raise BillingError("Эта запись уже отменена — выберите время заново.")
        if session.status not in (S.DRAFT, S.AWAITING_PAYMENT, S.PAID):
            raise BillingError("Эту запись уже нельзя оплатить.")
        if session.scheduled_at + timedelta(minutes=session.duration_minutes) <= timezone.now():
            raise BillingError("Время этой записи уже прошло.")
        amount = int(session.amount_kopecks)
        client = session.client
        if amount > 0:
            # Сначала — программа компании (apps.business), остаток — с личного баланса
            corp_acc, covered = _corp_reserve(session, amount)
            post(
                T.HOLD, f"hold:{session.pk}",
                [(account_for(client, K.CLIENT), -(amount - covered)), (account_for(client, K.CLIENT_HOLD), amount)]
                + ([(corp_acc, -covered)] if covered else []),
                session_id=session.pk, memo="Оплата созвона",
                metadata={"company_kopecks": covered} if covered else None,
            )
        hold = Hold.objects.create(
            session=session, session_ref=session.pk, client=client, specialist=session.psychologist_profile.user,
            client_ref=str(client.pk), specialist_ref=str(session.psychologist_profile.user_id),
            amount_kopecks=amount, duration_minutes=session.duration_minutes, scheduled_at=session.scheduled_at,
        )
        if session.status in (S.DRAFT, S.AWAITING_PAYMENT):
            mark_session_paid(session, {"mode": "balance"})
        return hold


# ── Программы компаний (apps.business): кто платит первым ─────────────

def _corp():
    from django.apps import apps as django_apps

    if not django_apps.is_installed("apps.business"):
        return None
    from apps.business import funding

    return funding


def _corp_reserve(session, amount: int):
    """(счёт бюджета компании, сколько покрывает программа). Вызывается внутри транзакции оплаты."""
    corp = _corp()
    if corp is None:
        return None, 0
    return corp.reserve_call(session, amount)


def _corp_share(hold: Hold):
    """(счёт компании, сколько ещё «лежит» денег компании в этой оплате) — для возвратов."""
    corp = _corp()
    if corp is None:
        return None, 0
    return corp.company_share(hold.session_ref)


def start_call_payment(session) -> Hold | None:
    """Новая запись: «ждёт оплаты», и сразу пробуем оплатить с баланса (клиент подтвердил цену)."""
    from apps.sessions.models import SessionEvent

    S = _session_model().Status
    if session.status == S.DRAFT:
        session.status = S.AWAITING_PAYMENT
        session.save(update_fields=["status", "updated_at"])
        SessionEvent.objects.create(
            session=session, event_type=SessionEvent.EventType.PAYMENT_INITIATED, metadata={"mode": "balance"},
        )
    try:
        return hold_for_call(session)
    except InsufficientFunds:
        return None


GROUP_HOLD_MARK = "group"


def hold_for_group(*, ref, client, specialist, amount_kopecks: int, scheduled_at, duration_minutes: int,
                   memo: str = "Оплата круга", metadata: dict | None = None) -> Hold:
    """Заморозка за групповую встречу/цикл (apps.circles) — без ConsultationSession.

    ref — уникальный UUID единицы оплаты (Hold.session_ref): дальше деньги двигаются теми же
    capture_for_call(ref) / release_for_call(ref, reason) с правилами отмены, как у созвонов.
    Такие заморозки помечены reason="group": settle_overdue_calls их не трогает — их
    расчитывает владелец (apps.circles.services.sweep). Идемпотентно по ref.
    """
    with transaction.atomic():
        hold = _hold_of(ref, lock=True)
        if hold is not None:
            return hold
        amount = int(amount_kopecks)
        if amount > 0:
            # Программа компании (если в ней есть «Круги») платит первой — apps.business
            corp = _corp()
            corp_acc, covered = corp.reserve_group(client, amount, ref=ref, scheduled_at=scheduled_at,
                                                   minutes=duration_minutes) if corp else (None, 0)
            post(
                T.HOLD, f"hold:{ref}",
                [(account_for(client, K.CLIENT), -(amount - covered)), (account_for(client, K.CLIENT_HOLD), amount)]
                + ([(corp_acc, -covered)] if covered else []),
                session_id=ref, memo=memo, metadata={**(metadata or {}), **({"company_kopecks": covered} if covered else {})},
            )
        return Hold.objects.create(
            session=None, session_ref=ref, client=client, specialist=specialist,
            client_ref=str(client.pk), specialist_ref=str(specialist.pk), amount_kopecks=amount,
            duration_minutes=duration_minutes, scheduled_at=scheduled_at, reason=GROUP_HOLD_MARK,
        )


def _settle(hold: Hold, *, penalty_kopecks: int, reason: str, kind: str, by=None) -> Hold:
    """Разморозить: penalty уходит специалисту (минус комиссия), остальное — клиенту."""
    amount = hold.amount_kopecks
    penalty = max(0, min(int(penalty_kopecks), amount))
    returned = amount - penalty
    spec, fee = split_fee(penalty)
    legs = []
    corp_acc, corp_net = _corp_share(hold)
    # Возврат — в обратном порядке оплаты: сначала личная часть, остальное — в бюджет компании
    to_client = min(returned, amount - corp_net)
    to_company = returned - to_client
    if amount:
        legs.append((account_for(hold.client_ref, K.CLIENT_HOLD), -amount))
        if to_client:
            legs.append((account_for(hold.client_ref, K.CLIENT), to_client))
        if to_company:
            legs.append((corp_acc, to_company))
        if spec:
            legs.append((account_for(hold.specialist_ref, K.SPEC_PENDING), spec))
        if fee:
            legs.append((system_account(K.PLATFORM_FEE), fee))
        post(kind, f"settle:{hold.pk}", legs, session_id=hold.session_ref, memo=reason, metadata={"reason": reason}, by=by)
    now = timezone.now()
    hold.specialist_kopecks = spec
    hold.fee_kopecks = fee
    hold.returned_kopecks = returned
    hold.reason = reason[:40]
    hold.settled_at = now
    if penalty == 0:
        hold.status = HS.RELEASED
    elif penalty == amount:
        hold.status = HS.CAPTURED
    else:
        hold.status = HS.PARTIAL
    if spec:
        hold.available_at = now + timedelta(hours=conf.earnings_hold_hours())
    hold.save()
    if corp_acc is not None:
        _corp().settled(hold.session_ref, returned_kopecks=to_company)
    return hold


def capture_for_call(session, *, by=None, reason: str = "completed") -> Hold | None:
    """Созвон состоялся: доля специалиста — в «ожидает», комиссия — платформе."""
    with transaction.atomic():
        hold = _hold_of(session, lock=True)
        if hold is None or hold.status != HS.ACTIVE:
            return hold
        return _settle(hold, penalty_kopecks=hold.amount_kopecks, reason=reason, kind=T.CAPTURE, by=by)


FULL_REFUND_REASONS = {
    "specialist_cancel", "specialist_no_show", "no_show_both", "staff_cancel", "staff_refund", "unpaid", "system",
    "cancelled",
}


def cancel_penalty_kopecks(hold: Hold, now=None) -> int:
    """Клиент отменяет: бесплатно не позже чем за N часов, позже — штраф в % (настраивается)."""
    now = now or timezone.now()
    start = hold.scheduled_at or now
    if start - now >= timedelta(hours=conf.free_cancel_hours()):
        return 0
    pct = conf.late_cancel_penalty_percent()
    return int((Decimal(hold.amount_kopecks) * pct / 100).quantize(Decimal("1"), ROUND_HALF_UP))


def normalize_reason(reason: str) -> str:
    """Принимает и формы из apps.dialogs: cancelled_by_client[_late], cancelled_by_specialist…"""
    reason = (reason or "cancelled").strip()
    if reason.startswith("cancelled_by_"):
        who = reason[len("cancelled_by_"):].removesuffix("_late")
        return {"client": "client_cancel", "specialist": "specialist_cancel", "psychologist": "specialist_cancel",
                "staff": "staff_cancel", "system": "system"}.get(who, "cancelled")
    return reason


def release_for_call(session, reason: str = "cancelled", *, penalty_percent: int | None = None, by=None) -> Hold | None:
    """Вернуть деньги за созвон по правилам отмены.

    reason: client_cancel (правило 24 ч), specialist_cancel / specialist_no_show / staff_* /
    unpaid / system (полный возврат), client_no_show (списание целиком).
    penalty_percent — ручное решение сотрудника (перекрывает правила).
    """
    reason = normalize_reason(reason)
    with transaction.atomic():
        hold = _hold_of(session, lock=True)
        if hold is None or hold.status != HS.ACTIVE:
            return hold
        if penalty_percent is not None:
            pct = max(0, min(100, int(penalty_percent)))
            penalty = int((Decimal(hold.amount_kopecks) * pct / 100).quantize(Decimal("1"), ROUND_HALF_UP))
        elif reason == "client_cancel":
            penalty = cancel_penalty_kopecks(hold)
            if penalty:
                reason = "late_cancel"
        elif reason == "client_no_show":
            penalty = hold.amount_kopecks
        else:
            penalty = 0
        kind = T.CAPTURE if penalty == hold.amount_kopecks and penalty else T.RELEASE
        return _settle(hold, penalty_kopecks=penalty, reason=reason, kind=kind, by=by)


def refund_captured_call(session_or_hold, *, by=None, reason: str = "staff_refund") -> Hold:
    """Решение сотрудника: вернуть клиенту деньги за уже списанный созвон (пока заработок не выплачен)."""
    with transaction.atomic():
        hold = session_or_hold if isinstance(session_or_hold, Hold) else _hold_of(session_or_hold)
        if hold is None:
            raise BillingError("По этому созвону не было оплаты с баланса.")
        hold = Hold.objects.select_for_update().get(pk=hold.pk)
        if hold.status == HS.ACTIVE:
            return release_for_call(hold.session_ref, "staff_refund", by=by)
        if hold.status not in (HS.CAPTURED, HS.PARTIAL):
            raise BillingError("Деньги за этот созвон уже возвращены.")
        charged = hold.specialist_kopecks + hold.fee_kopecks
        if charged <= 0:
            raise BillingError("Возвращать нечего.")
        legs = []
        if hold.specialist_kopecks:
            src = K.SPEC_AVAILABLE if hold.matured else K.SPEC_PENDING
            legs.append((account_for(hold.specialist_ref, src), -hold.specialist_kopecks))
        if hold.fee_kopecks:
            legs.append((system_account(K.PLATFORM_FEE), -hold.fee_kopecks))
        corp_acc, corp_net = _corp_share(hold)
        to_company = min(charged, corp_net)
        if charged - to_company:
            legs.append((account_for(hold.client_ref, K.CLIENT), charged - to_company))
        if to_company:
            legs.append((corp_acc, to_company))
        try:
            post(T.CALL_REFUND, f"call_refund:{hold.pk}", legs, session_id=hold.session_ref, memo=reason, by=by)
        except InsufficientFunds as exc:
            raise BillingError("Заработок за этот созвон уже выплачен специалисту — верните деньги корректировкой.") from exc
        hold.returned_kopecks = hold.amount_kopecks
        hold.status = HS.REFUNDED
        hold.reason = reason[:40]
        hold.save(update_fields=["returned_kopecks", "status", "reason"])
        if corp_acc is not None:
            _corp().settled(hold.session_ref, returned_kopecks=to_company, refund=True)
        return hold


def reason_from_event(metadata: dict) -> str | None:
    """Причина отмены из SessionEvent SESSION_ENDED."""
    who = (metadata or {}).get("cancelled_by")
    if not who:
        return None
    return {
        "client": "client_cancel",
        "psychologist": "specialist_cancel",
        "specialist": "specialist_cancel",
        "staff": "staff_refund" if metadata.get("refund") else "staff_cancel",
        "system": "system",
    }.get(who, "cancelled")


# ── Фоновые задачи ────────────────────────────────────────────────

def mature_earnings(now=None) -> int:
    now = now or timezone.now()
    n = 0
    ids = list(
        Hold.objects.filter(status__in=(HS.CAPTURED, HS.PARTIAL), matured=False, specialist_kopecks__gt=0,
                            available_at__lte=now).values_list("pk", flat=True)[:500]
    )
    for pk in ids:
        with transaction.atomic():
            hold = Hold.objects.select_for_update().get(pk=pk)
            if hold.matured or hold.status not in (HS.CAPTURED, HS.PARTIAL):
                continue
            post(T.MATURE, f"mature:{hold.pk}", [
                (account_for(hold.specialist_ref, K.SPEC_PENDING), -hold.specialist_kopecks),
                (account_for(hold.specialist_ref, K.SPEC_AVAILABLE), hold.specialist_kopecks),
            ], session_id=hold.session_ref, memo="Заработок доступен к выплате")
            hold.matured = True
            hold.save(update_fields=["matured"])
            n += 1
    return n


def expire_unpaid_calls(now=None) -> int:
    """Неоплаченные записи старше BILLING_UNPAID_TTL_MINUTES (или уже начавшиеся) освобождают время."""
    from apps.sessions.models import SessionEvent

    Session = _session_model()
    now = now or timezone.now()
    ttl = timedelta(minutes=conf.unpaid_ttl_minutes())
    qs = (
        Session.objects.filter(status=Session.Status.AWAITING_PAYMENT, billing_hold__isnull=True, payment__isnull=True)
        .filter(created_at__lte=now - ttl) | Session.objects.filter(
            status=Session.Status.AWAITING_PAYMENT, billing_hold__isnull=True, payment__isnull=True, scheduled_at__lte=now,
        )
    )
    n = 0
    for session in qs.distinct()[:500]:
        with transaction.atomic():
            s = Session.objects.select_for_update().get(pk=session.pk)
            if s.status != Session.Status.AWAITING_PAYMENT or Hold.objects.filter(session_ref=s.pk).exists():
                continue
            s.status = Session.Status.CANCELLED
            s.save(update_fields=["status", "updated_at"])
            SessionEvent.objects.create(
                session=s, event_type=SessionEvent.EventType.SESSION_ENDED,
                metadata={"cancelled_by": "system", "mode": "unpaid"},
            )
            n += 1
    return n


def _joined_roles(session) -> set[str]:
    from apps.sessions.models import SessionEvent

    return {
        (m or {}).get("participant_role")
        for m in session.events.filter(event_type=SessionEvent.EventType.PARTICIPANT_JOINED).values_list("metadata", flat=True)
    }


def settle_overdue_calls(now=None) -> int:
    """Созвоны с активной заморозкой, которые давно закончились, но не были завершены."""
    Session = _session_model()
    S = Session.Status
    now = now or timezone.now()
    grace = timedelta(minutes=conf.settle_grace_minutes())
    n = 0
    # Групповые заморозки (apps.circles) расчитывает их владелец
    holds = Hold.objects.filter(status=HS.ACTIVE).exclude(reason=GROUP_HOLD_MARK).select_related("session")[:500]
    for hold in holds:
        session = hold.session
        if session is None:
            release_for_call(hold.session_ref, "system")
            n += 1
            continue
        if session.status == S.COMPLETED:
            capture_for_call(session)
            n += 1
            continue
        if session.status in (S.CANCELLED, S.REFUNDED):
            # Отменили без события (или событие пришло без причины) — полный возврат
            if session.updated_at <= now - timedelta(minutes=2):
                release_for_call(session, "cancelled")
                n += 1
            continue
        end = session.scheduled_at + timedelta(minutes=session.duration_minutes)
        if end + grace > now:
            continue
        joined = _joined_roles(session)
        if "psychologist" not in joined:
            release_for_call(session, "specialist_no_show" if "client" in joined else "no_show_both")
        elif "client" not in joined:
            release_for_call(session, "client_no_show")
        else:
            capture_for_call(session, reason="auto_completed")
            if session.status == S.IN_PROGRESS:
                session.status = S.COMPLETED
                session.completed_at = session.completed_at or now
                session.save(update_fields=["status", "completed_at", "updated_at"])
        n += 1
    return n


def sweep(now=None) -> dict:
    return {
        "unpaid_expired": expire_unpaid_calls(now),
        "calls_settled": settle_overdue_calls(now),
        "earnings_matured": mature_earnings(now),
        "topups_expired": expire_stale_topups(now),
    }


def maybe_sweep() -> None:
    """Дешёвый «ленивый» запуск не чаще раза в минуту (дополняет сервис scheduler)."""
    if cache.add("billing:sweep-lock", 1, timeout=60):
        try:
            sweep()
        except Exception:  # pragma: no cover — фон не должен ломать запрос
            logger.exception("billing sweep failed")


# ── Пополнения ────────────────────────────────────────────────────

def _receipt_contact(email: str | None, phone: str | None) -> dict | None:
    email = (email or "").strip()
    phone = "".join(ch for ch in (phone or "") if ch.isdigit())
    if email:
        if "@" not in email or len(email) > 254:
            raise BillingError("Проверьте email для чека.")
        return {"email": email}
    if phone:
        if len(phone) == 10:
            phone = "7" + phone
        if len(phone) == 11 and phone.startswith("8"):
            phone = "7" + phone[1:]
        if len(phone) != 11:
            raise BillingError("Проверьте номер телефона для чека.")
        return {"phone": phone}
    return None


def safe_return_path(path: str | None) -> str:
    """Куда вернуть клиента после оплаты: только наши страницы кабинета."""
    path = (path or "").strip()
    if not path.startswith("/app/") or "//" in path or "\\" in path or len(path) > 200:
        return "/app/balance"
    return path


def create_topup(user, amount_kopecks: int, *, method: str = "any", receipt_email: str = "", receipt_phone: str = "",
                 provider: str | None = None, return_to: str | None = None) -> TopUp:
    amount = int(amount_kopecks)
    if amount < conf.topup_min_kopecks():
        raise BillingError(f"Минимальная сумма пополнения — {conf.topup_min_kopecks() // 100} ₽.")
    if amount > conf.topup_max_kopecks():
        raise BillingError(f"Максимальная сумма пополнения — {conf.topup_max_kopecks() // 100} ₽.")
    if balance_of(user) + amount > conf.max_balance_kopecks():
        raise BillingError(f"На балансе может быть не больше {conf.max_balance_kopecks() // 100} ₽.")
    if method not in METHODS:
        raise BillingError("Выберите способ оплаты.")
    providers = available_providers()
    provider = provider or (providers[0] if providers else None)
    if provider is None or provider not in providers:
        raise BillingError("Пополнение временно недоступно. Попробуйте позже.")
    contact = _receipt_contact(receipt_email, receipt_phone) if provider == "yookassa" else None
    if provider == "yookassa" and conf.receipts_enabled() and conf.receipt_required() and not contact:
        raise BillingError("Укажите email или телефон для чека.")
    if not conf.receipts_enabled():
        contact = None
    topup = TopUp.objects.create(user=user, user_ref=str(user.pk), provider=provider, amount_kopecks=amount, method=method,
                                 with_receipt=bool(contact))
    back = safe_return_path(return_to)
    return_url = f"{conf.public_url()}{back}{'&' if '?' in back else '?'}topup={topup.id}"
    try:
        remote = get_provider(provider).create_payment(topup, method=method, return_url=return_url, receipt_contact=contact)
    except ProviderError as exc:
        logger.warning("topup %s: provider error %s", topup.id, exc)
        topup.status = TopUp.Status.CANCELED
        topup.cancel_reason = "provider_error"
        topup.save(update_fields=["status", "cancel_reason"])
        raise BillingError("Платёжный сервис не ответил. Попробуйте через минуту.") from exc
    # contact больше нигде не используется и не сохраняется
    if provider == "mock":
        from urllib.parse import quote

        remote.confirmation_url += f"&return={quote(back, safe='')}"
    topup.provider_payment_id = remote.id
    topup.confirmation_type = remote.confirmation_type or "redirect"
    topup.confirmation_url = remote.confirmation_url[:500]
    topup.confirmation_token = remote.confirmation_token[:200]
    topup.save(update_fields=["provider_payment_id", "confirmation_type", "confirmation_url", "confirmation_token"])
    return topup


def apply_topup_status(topup: TopUp, remote: ProviderPayment) -> TopUp:
    """Применяет статус, полученный ОТ ПРОВАЙДЕРА (не из тела вебхука). Идемпотентно."""
    with transaction.atomic():
        topup = TopUp.objects.select_for_update().get(pk=topup.pk)
        if remote.id != topup.provider_payment_id:
            raise BillingError("Платёж не совпадает.")
        meta_id = (remote.metadata or {}).get("topup_id")
        if meta_id and meta_id != str(topup.id):
            raise BillingError("Платёж не совпадает.")
        if remote.status == "succeeded":
            if remote.amount_kopecks != topup.amount_kopecks:
                logger.warning("topup %s: amount mismatch", topup.id)
                raise BillingError("Сумма платежа не совпадает.")
            if topup.status == TopUp.Status.PENDING or topup.status == TopUp.Status.CANCELED:
                target = account_for(topup.user_ref, K.CLIENT)
                post(T.TOPUP, f"topup:{topup.pk}", [
                    (system_account(K.PROVIDER, topup.provider), -topup.amount_kopecks),
                    (target, topup.amount_kopecks),
                ], memo="Пополнение баланса", metadata={"provider": topup.provider})
                topup.status = TopUp.Status.SUCCEEDED
                topup.paid_at = timezone.now()
                topup.save(update_fields=["status", "paid_at"])
        elif remote.status == "canceled" and topup.status == TopUp.Status.PENDING:
            topup.status = TopUp.Status.CANCELED
            topup.cancel_reason = "provider"
            topup.save(update_fields=["status", "cancel_reason"])
        return topup


def refresh_topup(topup: TopUp) -> TopUp:
    """Спросить у провайдера статус (страница возврата после оплаты — запасной путь к вебхуку)."""
    if topup.status != TopUp.Status.PENDING or topup.provider == "mock" or not topup.provider_payment_id:
        return topup
    try:
        remote = get_provider(topup.provider).fetch_payment(topup.provider_payment_id)
    except ProviderError:
        return topup
    try:
        return apply_topup_status(topup, remote)
    except BillingError:
        return topup


def mock_checkout(topup: TopUp, outcome: str) -> TopUp:
    if topup.provider != "mock":
        raise BillingError("Это не тестовый платёж.")
    if topup.status != TopUp.Status.PENDING:
        return topup
    status = "succeeded" if outcome == "succeeded" else "canceled"
    remote = ProviderPayment(id=topup.provider_payment_id, status=status, amount_kopecks=topup.amount_kopecks,
                             metadata={"topup_id": str(topup.id)}, test=True)
    return apply_topup_status(topup, remote)


def expire_stale_topups(now=None) -> int:
    """Незавершённые тестовые платежи старше суток — отменить (живые ЮKassa отменяет сама и присылает вебхук)."""
    now = now or timezone.now()
    return TopUp.objects.filter(provider="mock", status=TopUp.Status.PENDING,
                                created_at__lt=now - timedelta(days=1)).update(status=TopUp.Status.CANCELED,
                                                                                cancel_reason="expired")


def refund_topup_to_card(topup: TopUp, *, by=None) -> TopUp:
    """Сотрудник возвращает пополнение на карту (если деньги ещё на балансе клиента)."""
    with transaction.atomic():
        topup = TopUp.objects.select_for_update().get(pk=topup.pk)
        if topup.status != TopUp.Status.SUCCEEDED:
            raise BillingError("Вернуть можно только зачисленное пополнение.")
        amount = topup.amount_kopecks
        try:
            post(T.TOPUP_REFUND, f"topup_refund:{topup.pk}", [
                (account_for(topup.user_ref, K.CLIENT), -amount),
                (system_account(K.PROVIDER, topup.provider), amount),
            ], memo="Возврат пополнения на карту", by=by)
        except InsufficientFunds as exc:
            raise BillingError("На балансе клиента уже меньше этой суммы: часть денег потрачена.") from exc
        try:
            refund = get_provider(topup.provider).refund(topup, amount, key=f"refund-{topup.pk}")
        except ProviderError as exc:
            raise BillingError(f"Провайдер не принял возврат: {exc}") from exc  # atomic откатит проводку
        if refund.status == "canceled":
            raise BillingError("Провайдер отклонил возврат.")
        topup.status = TopUp.Status.REFUNDED
        topup.refunded_kopecks = amount
        topup.provider_refund_id = refund.id
        topup.save(update_fields=["status", "refunded_kopecks", "provider_refund_id"])
        return topup


def _reverse_topup_refund(topup: TopUp) -> None:
    with transaction.atomic():
        topup = TopUp.objects.select_for_update().get(pk=topup.pk)
        if topup.status != TopUp.Status.REFUNDED:
            return
        post(T.TOPUP_REFUND_REVERSAL, f"topup_refund_reversal:{topup.pk}", [
            (system_account(K.PROVIDER, topup.provider), -topup.refunded_kopecks),
            (account_for(topup.user_ref, K.CLIENT), topup.refunded_kopecks),
        ], memo="Возврат на карту не прошёл — деньги снова на балансе")
        topup.status = TopUp.Status.SUCCEEDED
        topup.refunded_kopecks = 0
        topup.save(update_fields=["status", "refunded_kopecks"])


# ── Вебхук ЮKassa ─────────────────────────────────────────────────

def handle_yookassa_webhook(payload: dict, ip: str | None) -> str:
    """Тело — только подсказка (событие + id). Истинный статус перезапрашивается у API ЮKassa."""
    event = str(payload.get("event") or "")[:40]
    obj = payload.get("object") or {}
    oid = str(obj.get("id") or "")[:100]
    if not event or not oid:
        return "ignored"
    result = "ignored"
    if event.startswith("payment."):
        topup = TopUp.objects.filter(provider_payment_id=oid, provider="yookassa").first()
        if topup is None:
            result = "unknown"
        else:
            remote = get_provider("yookassa").fetch_payment(oid)
            topup = apply_topup_status(topup, remote)
            result = topup.status
    elif event.startswith("refund."):
        topup = TopUp.objects.filter(provider_refund_id=oid, provider="yookassa").first()
        if topup is None:
            result = "unknown"
        else:
            remote = get_provider("yookassa").fetch_refund(oid)
            if remote.status == "canceled":
                _reverse_topup_refund(topup)
            result = f"refund_{remote.status}"
    elif event.startswith("payout."):
        payout = PayoutRequest.objects.filter(provider_payout_id=oid).first()
        if payout is None:
            result = "unknown"
        else:
            remote = get_payout_rail("yookassa").fetch(oid)
            payout = apply_payout_status(payout, remote.status)
            result = payout.status
    WebhookEvent.objects.create(provider="yookassa", event=event, object_id=oid, result=result[:40], ip=ip)
    return result


# ── Подарочные коды ───────────────────────────────────────────────

CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # без 0/O, 1/I/L


def normalize_code(raw: str) -> str:
    s = "".join(ch for ch in (raw or "").upper() if ch.isalnum())
    s = s.replace("O", "0").replace("I", "1").replace("L", "1")
    if s.startswith("APR"):
        s = s[3:]
    return s


def format_code(core: str) -> str:
    return "APR-" + "-".join(core[i:i + 4] for i in range(0, len(core), 4))


def generate_gift_batch(*, amount_kopecks: int, count: int, label: str = "", expires_at=None, by=None) -> tuple[GiftBatch, list[str]]:
    """Коды возвращаются ОДИН раз (для выгрузки). В базе — только их HMAC."""
    if not (100 * 100 <= amount_kopecks <= 100000 * 100):
        raise BillingError("Номинал — от 100 до 100 000 ₽.")
    if not (1 <= count <= 1000):
        raise BillingError("В одной партии — от 1 до 1000 кодов.")
    codes = []
    with transaction.atomic():
        batch = GiftBatch.objects.create(label=label[:80], amount_kopecks=amount_kopecks, count=count,
                                         expires_at=expires_at, created_by=by)
        objs = []
        seen = set()
        while len(objs) < count:
            core = "".join(secrets.choice(CODE_ALPHABET) for _ in range(12))
            h = code_hash(core)
            if h in seen:
                continue
            seen.add(h)
            codes.append(format_code(core))
            objs.append(GiftCode(batch=batch, code_hash=h, hint=core[-4:]))
        GiftCode.objects.bulk_create(objs)
    return batch, codes


REDEEM_FAIL_LIMIT = 10  # неудачных попыток в час на аккаунт


def redeem_gift_code(user, raw: str) -> int:
    fails_key = f"billing:gift-fails:{user.pk}"
    if (cache.get(fails_key) or 0) >= REDEEM_FAIL_LIMIT:
        raise BillingError("Слишком много неверных попыток. Попробуйте через час.")
    core = normalize_code(raw)
    code = GiftCode.objects.filter(code_hash=code_hash(core)).select_related("batch").first() if len(core) == 12 else None

    def fail(msg: str):
        try:
            cache.incr(fails_key)
        except ValueError:
            cache.set(fails_key, 1, 3600)
        raise BillingError(msg)

    if code is None:
        fail("Такого кода нет. Проверьте, нет ли опечатки.")
    with transaction.atomic():
        code = GiftCode.objects.select_for_update().select_related("batch").get(pk=code.pk)
        if code.status == GiftCode.Status.REDEEMED:
            raise BillingError("Этот код уже использован.")
        if code.status == GiftCode.Status.REVOKED or code.batch.revoked:
            raise BillingError("Этот код больше не действует.")
        if code.batch.expires_at and code.batch.expires_at < timezone.now():
            raise BillingError("Срок действия кода истёк.")
        amount = code.batch.amount_kopecks
        if balance_of(user) + amount > conf.max_balance_kopecks():
            raise BillingError(f"На балансе может быть не больше {conf.max_balance_kopecks() // 100} ₽.")
        post(T.GIFT_REDEEM, f"gift:{code.pk}", [
            (system_account(K.GIFT), -amount), (account_for(user, K.CLIENT), amount),
        ], memo="Подарочный код", metadata={"batch": str(code.batch_id)})
        code.status = GiftCode.Status.REDEEMED
        code.redeemed_by = user
        code.redeemed_at = timezone.now()
        code.save(update_fields=["status", "redeemed_by", "redeemed_at"])
    return amount


def revoke_gift_batch(batch: GiftBatch) -> int:
    with transaction.atomic():
        batch.revoked = True
        batch.save(update_fields=["revoked"])
        return GiftCode.objects.filter(batch=batch, status=GiftCode.Status.ACTIVE).update(status=GiftCode.Status.REVOKED)


# ── Корректировки (сотрудники) ────────────────────────────────────

def adjust_client_balance(user, amount_kopecks: int, *, reason: str, key: str, by=None) -> LedgerTransaction:
    amount = int(amount_kopecks)
    if amount == 0 or abs(amount) > 100000 * 100:
        raise BillingError("Сумма корректировки — от 1 ₽ до 100 000 ₽.")
    if not reason.strip():
        raise BillingError("Укажите причину.")
    try:
        txn, _ = post(T.ADJUSTMENT, f"adj:{key}", [
            (system_account(K.ADJUSTMENT), -amount), (account_for(user, K.CLIENT), amount),
        ], memo=reason.strip()[:200], by=by)
    except InsufficientFunds as exc:
        raise BillingError("На балансе меньше этой суммы.") from exc
    return txn


# ── Выплаты специалистам ──────────────────────────────────────────

def _digits(x: str) -> str:
    return "".join(ch for ch in (x or "") if ch.isdigit())


def set_payout_method(user, *, kind: str, tax_status: str, details: dict) -> PayoutMethod:
    kind = kind or ""
    clean: dict = {"kind": kind}
    if kind == PayoutMethod.Kind.SBP:
        phone = _digits(details.get("phone", ""))
        if len(phone) == 10:
            phone = "7" + phone
        if len(phone) == 11 and phone.startswith("8"):
            phone = "7" + phone[1:]
        if len(phone) != 11 or not phone.startswith("7"):
            raise BillingError("Укажите российский номер телефона, привязанный к СБП.")
        bank = (details.get("bank_name") or "").strip()[:60]
        if not bank:
            raise BillingError("Укажите банк получателя.")
        clean.update(phone=phone, bank_name=bank, bank_id=(details.get("bank_id") or "").strip()[:20])
        masked = f"СБП, {bank}, +7 ••• •••-{phone[-4:-2]}-{phone[-2:]}"
    elif kind == PayoutMethod.Kind.BANK_ACCOUNT:
        account = _digits(details.get("account", ""))
        bik = _digits(details.get("bik", ""))
        name = (details.get("recipient", "") or "").strip()[:120]
        if len(account) != 20 or len(bik) != 9:
            raise BillingError("Номер счёта — 20 цифр, БИК — 9 цифр.")
        if not name:
            raise BillingError("Укажите получателя, как в банке.")
        clean.update(account=account, bik=bik, recipient=name)
        masked = f"Счёт •••• {account[-4:]}, БИК {bik}"
    elif kind == PayoutMethod.Kind.CARD_TOKEN:
        token = (details.get("token") or "").strip()
        last4 = _digits(details.get("last4", ""))[-4:]
        if not token:
            raise BillingError("Карта не привязана.")
        clean.update(token=token, last4=last4)
        masked = f"Карта •••• {last4}" if last4 else "Карта"
    else:
        raise BillingError("Выберите способ получения выплат.")
    inn = _digits(details.get("inn", ""))
    if inn and len(inn) != 12:
        raise BillingError("ИНН физлица — 12 цифр.")
    if inn:
        clean["inn"] = inn
    if details.get("self_employed_id"):
        clean["self_employed_id"] = str(details["self_employed_id"])[:64]
    if tax_status not in PayoutMethod.TaxStatus.values:
        raise BillingError("Выберите налоговый статус.")
    method, _ = PayoutMethod.objects.update_or_create(
        user=user, defaults={"kind": kind, "tax_status": tax_status, "encrypted": encrypt_json(clean), "masked": masked},
    )
    return method


def payout_details_for_staff(method: PayoutMethod) -> dict:
    """Расшифрованные реквизиты — только для ручной выплаты (право finance.manage, запись в журнал)."""
    return decrypt_json(method.encrypted)


def request_payout(user, amount_kopecks: int | None = None) -> PayoutRequest:
    method = PayoutMethod.objects.filter(user=user).first()
    if method is None:
        raise BillingError("Сначала укажите реквизиты для выплат.")
    available = balance_of(user, K.SPEC_AVAILABLE)
    amount = available if amount_kopecks is None else int(amount_kopecks)
    if amount < conf.payout_min_kopecks():
        raise BillingError(f"Минимальная выплата — {conf.payout_min_kopecks() // 100} ₽.")
    if amount > available:
        raise BillingError("Сумма больше доступной к выплате.")
    if PayoutRequest.objects.filter(specialist=user, status__in=PayoutRequest.OPEN).exists():
        raise BillingError("Предыдущая выплата ещё в обработке.")
    rail = default_payout_rail()
    if rail == "yookassa" and method.kind == PayoutMethod.Kind.BANK_ACCOUNT:
        rail = "manual"
    with transaction.atomic():
        payout = PayoutRequest.objects.create(
            specialist=user, specialist_ref=str(user.pk), amount_kopecks=amount, rail=rail,
            destination_kind=method.kind, destination_masked=method.masked,
        )
        try:
            post(T.PAYOUT_REQUEST, f"payout_request:{payout.pk}", [
                (account_for(user, K.SPEC_AVAILABLE), -amount), (account_for(user, K.SPEC_PAYOUT), amount),
            ], memo="Запрос выплаты")
        except InsufficientFunds as exc:
            raise BillingError("Сумма больше доступной к выплате.") from exc
    return payout


def _payout_paid(payout: PayoutRequest) -> None:
    post(T.PAYOUT_PAID, f"payout_paid:{payout.pk}", [
        (account_for(payout.specialist_ref, K.SPEC_PAYOUT), -payout.amount_kopecks),
        (system_account(K.PAYOUTS_SENT), payout.amount_kopecks),
    ], memo="Выплата отправлена")


def _payout_return(payout: PayoutRequest) -> None:
    post(T.PAYOUT_RETURN, f"payout_return:{payout.pk}", [
        (account_for(payout.specialist_ref, K.SPEC_PAYOUT), -payout.amount_kopecks),
        (account_for(payout.specialist_ref, K.SPEC_AVAILABLE), payout.amount_kopecks),
    ], memo="Выплата не прошла — сумма снова доступна")


def approve_payout(payout: PayoutRequest, *, by=None) -> PayoutRequest:
    with transaction.atomic():
        payout = PayoutRequest.objects.select_for_update().get(pk=payout.pk)
        if payout.status != PayoutRequest.Status.REQUESTED:
            raise BillingError("Эта выплата уже обработана.")
        payout.decided_by = by
        payout.decided_at = timezone.now()
        rail = get_payout_rail(payout.rail)
        if rail.automatic:
            method = PayoutMethod.objects.filter(user=payout.specialist).first() if payout.specialist else None
            if method is None:
                raise BillingError("У специалиста нет реквизитов.")
            try:
                remote = rail.send(payout, decrypt_json(method.encrypted))
            except ProviderError as exc:
                raise BillingError(str(exc)) from exc
            payout.provider_payout_id = remote.id
            payout.status = PayoutRequest.Status.PROCESSING
            payout.save()
            return apply_payout_status(payout, remote.status)
        payout.status = PayoutRequest.Status.PROCESSING
        payout.save()
        return payout


def mark_payout_paid(payout: PayoutRequest, *, by=None, note: str = "") -> PayoutRequest:
    with transaction.atomic():
        payout = PayoutRequest.objects.select_for_update().get(pk=payout.pk)
        if payout.status not in PayoutRequest.OPEN:
            raise BillingError("Эта выплата уже закрыта.")
        if payout.rail != "manual":
            raise BillingError("Статус автоматической выплаты приходит от ЮKassa.")
        _payout_paid(payout)
        payout.status = PayoutRequest.Status.PAID
        payout.paid_at = timezone.now()
        payout.decided_by = payout.decided_by or by
        payout.decided_at = payout.decided_at or payout.paid_at
        if note:
            payout.note = note[:300]
        payout.save()
        return payout


def reject_payout(payout: PayoutRequest, *, by=None, note: str = "") -> PayoutRequest:
    with transaction.atomic():
        payout = PayoutRequest.objects.select_for_update().get(pk=payout.pk)
        if payout.status not in PayoutRequest.OPEN:
            raise BillingError("Эта выплата уже закрыта.")
        if payout.status == PayoutRequest.Status.PROCESSING and payout.rail != "manual":
            raise BillingError("Выплата уже отправлена в ЮKassa — дождитесь результата.")
        _payout_return(payout)
        payout.status = PayoutRequest.Status.REJECTED
        payout.decided_by = by
        payout.decided_at = timezone.now()
        payout.note = note[:300]
        payout.save()
        return payout


def apply_payout_status(payout: PayoutRequest, status: str) -> PayoutRequest:
    with transaction.atomic():
        payout = PayoutRequest.objects.select_for_update().get(pk=payout.pk)
        if payout.status not in PayoutRequest.OPEN:
            return payout
        if status == "succeeded":
            _payout_paid(payout)
            payout.status = PayoutRequest.Status.PAID
            payout.paid_at = timezone.now()
            payout.save()
        elif status == "canceled":
            _payout_return(payout)
            payout.status = PayoutRequest.Status.FAILED
            payout.save()
        return payout


# ── Сводки ────────────────────────────────────────────────────────

def kind_total(kind: str) -> int:
    return Account.objects.filter(kind=kind).aggregate(s=Sum("balance_kopecks"))["s"] or 0


def new_idempotency_key() -> str:
    return uuid.uuid4().hex
