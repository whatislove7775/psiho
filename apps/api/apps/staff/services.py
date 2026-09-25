"""Действия персонала над аккаунтами и сессиями (вызываются из views и модерации)."""
import decimal
import logging
import uuid

from django.db import transaction
from django.utils import timezone

from apps.sessions.models import ConsultationSession, SessionEvent
from apps.users.services import blacklist_user_tokens

from .authentication import forget_tokens_valid_after
from .models import AccountStatus

logger = logging.getLogger(__name__)
S = ConsultationSession.Status


class ActionError(Exception):
    """Действие невозможно — текст показывается сотруднику."""


def _status_for(user) -> AccountStatus:
    status, _ = AccountStatus.objects.get_or_create(user=user)
    return status


def force_logout(user) -> None:
    status = _status_for(user)
    status.tokens_valid_after = timezone.now()
    status.save(update_fields=["tokens_valid_after", "updated_at"])
    forget_tokens_valid_after(user.pk)
    blacklist_user_tokens(user)


@transaction.atomic
def block_user(user, *, by, reason: str) -> None:
    status = _status_for(user)
    status.blocked = True
    status.block_reason = reason[:500]
    status.blocked_at = timezone.now()
    status.blocked_by = by
    status.save()
    if user.is_active:
        user.is_active = False
        user.save(update_fields=["is_active"])
    force_logout(user)


@transaction.atomic
def unblock_user(user) -> None:
    status = _status_for(user)
    status.blocked = False
    status.block_reason = ""
    status.blocked_at = None
    status.blocked_by = None
    status.save()
    if not user.is_active:
        user.is_active = True
        user.save(update_fields=["is_active"])


# ── Сессии: отмена и возврат ────────────────────────────────────────

CANCELLABLE = (S.DRAFT, S.AWAITING_PAYMENT, S.PAID, S.IN_PROGRESS)
REFUNDABLE = (S.PAID, S.IN_PROGRESS, S.COMPLETED, S.CANCELLED)


def _payment_of(session):
    return getattr(session, "payment", None)


def refund_payment(session) -> dict:
    """Возврат через YooKassa (если платёж был) или отметка в dev-режиме."""
    from apps.payments.models import Payment
    from apps.payments.services import _configure_yookassa, yookassa_configured

    payment = _payment_of(session)
    if payment is None:
        return {"mode": "no_payment"}
    if payment.refunded_at:
        raise ActionError("Деньги по этой сессии уже возвращены.")
    if not yookassa_configured():
        payment.refunded_at = timezone.now()
        payment.save(update_fields=["refunded_at"])
        return {"mode": "dev"}
    amount = decimal.Decimal(payment.amount_rub)
    try:
        _configure_yookassa()
        if payment.status == Payment.Status.WAITING_FOR_CAPTURE:
            from yookassa import Payment as YKPayment

            YKPayment.cancel(payment.yookassa_payment_id, str(uuid.uuid4()))
            payment.status = Payment.Status.CANCELLED
            payment.refunded_at = timezone.now()
            payment.save(update_fields=["status", "refunded_at"])
            return {"mode": "yookassa_cancel"}
        if payment.status != Payment.Status.SUCCEEDED:
            raise ActionError("Платёж не завершён — возвращать нечего.")
        from yookassa import Refund

        refund = Refund.create({
            "payment_id": payment.yookassa_payment_id,
            "amount": {"value": f"{amount:.2f}", "currency": "RUB"},
            "description": f"Возврат за консультацию #{session.id}",
        }, str(uuid.uuid4()))
    except ActionError:
        raise
    except Exception as exc:
        logger.exception("YooKassa: не удалось вернуть платёж сессии %s", session.id)
        raise ActionError("Платёжный сервис не принял возврат. Попробуйте позже.") from exc
    payment.refunded_at = timezone.now()
    payment.save(update_fields=["refunded_at"])
    return {"mode": "yookassa", "refund_id": getattr(refund, "id", ""), "refund_status": getattr(refund, "status", "")}


@transaction.atomic
def cancel_session(session, *, refund: bool, reason: str, by_role: str) -> dict:
    session = ConsultationSession.objects.select_for_update().get(pk=session.pk)
    result: dict = {}
    if refund:
        if session.status not in REFUNDABLE + (S.AWAITING_PAYMENT,):
            raise ActionError("Для этой сессии возврат невозможен.")
        if session.status == S.REFUNDED:
            raise ActionError("Деньги по этой сессии уже возвращены.")
        result = refund_payment(session)
        session.status = S.REFUNDED
    else:
        if session.status not in CANCELLABLE:
            raise ActionError("Эту сессию уже нельзя отменить.")
        session.status = S.CANCELLED
    session.save(update_fields=["status", "updated_at"])
    SessionEvent.objects.create(
        session=session,
        event_type=SessionEvent.EventType.SESSION_ENDED,
        metadata={"cancelled_by": "staff", "staff_role": by_role, "refund": bool(refund)},
    )
    result["status"] = session.status
    return result
