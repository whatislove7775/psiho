"""
Сервис безопасной сделки — создание сессии и платежа YooKassa.

Схема работы:
1. Клиент выбирает психолога и слот → POST /api/v1/sessions/book/
2. Сервер создаёт ConsultationSession (сумма = ставка психолога)
3. Если YooKassa настроена — создаётся платёж, клиент уходит на confirmation_url,
   сессия в статусе awaiting_payment. Иначе (dev) — сессия сразу paid.
4. YooKassa → вебхук POST /api/v1/payments/webhook/. Статус платежа
   ПЕРЕЗАПРАШИВАЕТСЯ у API YooKassa — телу вебхука не доверяем.
5. succeeded → сессия paid; canceled → сессия cancelled (слот освобождается).
"""
import decimal
import logging
import uuid

from django.conf import settings
from django.db import transaction
from django.utils import timezone

try:  # пакет yookassa опционален для локальной разработки
    from yookassa import Configuration
    from yookassa import Payment as YKPayment
    YOOKASSA_AVAILABLE = True
except Exception:  # pragma: no cover
    Configuration = None
    YKPayment = None
    YOOKASSA_AVAILABLE = False

from apps.payments.models import Payment
from apps.sessions.models import ConsultationSession, SessionEvent

logger = logging.getLogger(__name__)


class PaymentProviderError(Exception):
    pass


def yookassa_configured() -> bool:
    return bool(
        YOOKASSA_AVAILABLE
        and getattr(settings, "YOOKASSA_SHOP_ID", "")
        and getattr(settings, "YOOKASSA_SECRET_KEY", "")
    )


def _configure_yookassa() -> None:
    Configuration.configure(settings.YOOKASSA_SHOP_ID, settings.YOOKASSA_SECRET_KEY)


def session_amount_rub(rate_rub, duration_minutes: int) -> int:
    rate = decimal.Decimal(rate_rub)
    if duration_minutes == 80:
        rate = rate * decimal.Decimal("1.5")
    return int(rate.quantize(decimal.Decimal("1"), rounding=decimal.ROUND_HALF_UP))


def create_session(client_user, psychologist_profile, scheduled_at, duration_minutes: int) -> ConsultationSession:
    amount_rub = session_amount_rub(psychologist_profile.session_rate_rub, duration_minutes)
    session = ConsultationSession(
        client=client_user,
        psychologist_profile=psychologist_profile,
        scheduled_at=scheduled_at,
        duration_minutes=duration_minutes,
        status=ConsultationSession.Status.DRAFT,
        amount_kopecks=amount_rub * 100,
    )
    session.compute_split(settings.PLATFORM_FEE_PERCENT)
    session.save()
    SessionEvent.objects.create(
        session=session,
        event_type=SessionEvent.EventType.TOKEN_CREATED,
        metadata={},
    )
    return session


def mark_session_paid(session: ConsultationSession, metadata: dict | None = None) -> None:
    if session.status not in (ConsultationSession.Status.DRAFT, ConsultationSession.Status.AWAITING_PAYMENT):
        return
    session.status = ConsultationSession.Status.PAID
    session.save(update_fields=["status", "updated_at"])
    SessionEvent.objects.create(
        session=session,
        event_type=SessionEvent.EventType.PAYMENT_CONFIRMED,
        metadata=metadata or {},
    )


def initiate_payment(session: ConsultationSession, return_url: str | None = None) -> Payment | None:
    """
    С YooKassa: создаёт платёж и переводит сессию в awaiting_payment.
    Без YooKassa (dev): сразу помечает сессию оплаченной, возвращает None.
    """
    if session.status != ConsultationSession.Status.DRAFT:
        raise ValueError(f"Неверный статус сессии для оплаты: {session.status}")

    if not yookassa_configured():
        mark_session_paid(session, {"mode": "dev"})
        return None

    amount_rub = decimal.Decimal(session.amount_kopecks) / 100
    payout_rub = decimal.Decimal(session.psychologist_payout_kopecks) / 100
    fee_rub = decimal.Decimal(session.platform_fee_kopecks) / 100
    idempotency_key = uuid.uuid4()
    profile = session.psychologist_profile

    request = {
        "amount": {"value": f"{amount_rub:.2f}", "currency": "RUB"},
        "confirmation": {
            "type": "redirect",
            "return_url": return_url or settings.YOOKASSA_RETURN_URL,
        },
        "capture": False,  # двухстадийный платёж, захват по вебхуку
        "description": f"Консультация #{session.id}",
        "metadata": {"session_id": str(session.id)},
    }
    if profile.yookassa_account_id:
        request["transfers"] = [{
            "account_id": profile.yookassa_account_id,
            "amount": {"value": f"{payout_rub:.2f}", "currency": "RUB"},
        }]

    try:
        _configure_yookassa()
        yk_payment = YKPayment.create(request, idempotency_key=str(idempotency_key))
    except Exception as exc:
        logger.exception("YooKassa: не удалось создать платёж для сессии %s", session.id)
        raise PaymentProviderError(str(exc)) from exc

    payment = Payment.objects.create(
        session=session,
        yookassa_payment_id=yk_payment.id,
        status=Payment.Status.PENDING,
        amount_rub=amount_rub,
        psychologist_payout_rub=payout_rub,
        platform_fee_rub=fee_rub,
        confirmation_url=yk_payment.confirmation.confirmation_url,
        idempotency_key=idempotency_key,
    )
    session.status = ConsultationSession.Status.AWAITING_PAYMENT
    session.save(update_fields=["status", "updated_at"])
    SessionEvent.objects.create(
        session=session,
        event_type=SessionEvent.EventType.PAYMENT_INITIATED,
        metadata={"yookassa_payment_id": yk_payment.id},
    )
    return payment


def _fetch_remote_status(payment: Payment, payload_object: dict) -> str | None:
    """Статус платежа из API YooKassa (при наличии ключей) или из тела вебхука (dev)."""
    if not yookassa_configured():
        return payload_object.get("status")
    _configure_yookassa()
    remote = YKPayment.find_one(payment.yookassa_payment_id)
    metadata = getattr(remote, "metadata", None) or {}
    if metadata.get("session_id") and metadata.get("session_id") != str(payment.session_id):
        logger.warning("YooKassa: metadata.session_id не совпадает для %s", payment.yookassa_payment_id)
        return None
    remote_amount = decimal.Decimal(str(remote.amount.value))
    if remote_amount != payment.amount_rub:
        logger.warning("YooKassa: сумма не совпадает для %s", payment.yookassa_payment_id)
        return None
    return remote.status


def _capture_payment(payment: Payment) -> str | None:
    if not yookassa_configured():
        return "succeeded"
    _configure_yookassa()
    result = YKPayment.capture(
        payment.yookassa_payment_id,
        {"amount": {"value": f"{payment.amount_rub:.2f}", "currency": "RUB"}},
        idempotency_key=str(uuid.uuid4()),
    )
    return getattr(result, "status", None)


@transaction.atomic
def handle_payment_webhook(payload: dict) -> Payment | None:
    """Обработка вебхука YooKassa. Истина — статус из API YooKassa, не из тела запроса."""
    payment_obj = payload.get("object") or {}
    yk_payment_id = payment_obj.get("id")
    if not yk_payment_id:
        return None
    payment = (
        Payment.objects.select_for_update()
        .select_related("session__psychologist_profile")
        .filter(yookassa_payment_id=yk_payment_id)
        .first()
    )
    if payment is None:
        return None

    remote_status = _fetch_remote_status(payment, payment_obj)
    session = payment.session

    if remote_status == "waiting_for_capture":
        payment.status = Payment.Status.WAITING_FOR_CAPTURE
        payment.save(update_fields=["status"])
        if session.status == ConsultationSession.Status.AWAITING_PAYMENT:
            remote_status = _capture_payment(payment)

    if remote_status == "succeeded" and payment.status != Payment.Status.SUCCEEDED:
        payment.status = Payment.Status.SUCCEEDED
        payment.captured_at = timezone.now()
        payment.save(update_fields=["status", "captured_at"])
        mark_session_paid(session, {"yookassa_payment_id": yk_payment_id})

    elif remote_status == "canceled" and payment.status != Payment.Status.CANCELLED:
        payment.status = Payment.Status.CANCELLED
        payment.save(update_fields=["status"])
        if session.status == ConsultationSession.Status.AWAITING_PAYMENT:
            session.status = ConsultationSession.Status.CANCELLED
            session.save(update_fields=["status", "updated_at"])

    return payment
