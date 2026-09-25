"""
Правила диалогов: кто и когда может писать, назначать, переносить и отменять созвоны.

Настройки (settings или переменные окружения):
- DIALOG_NEW_PER_DAY (5) — сколько новых диалогов без записи клиент может начать за сутки;
- DIALOG_FIRST_MESSAGES (3) — сколько сообщений клиент может отправить, пока специалист
  не ответил и созвон не назначен (защита специалистов от спама);
- DIALOG_FREE_CANCEL_HOURS (24) — до какого момента клиент бесплатно отменяет и переносит созвон;
- CHAT_ALLOW_WITHOUT_BOOKING (True) — False возвращает старое правило «писать только после записи».
"""
from datetime import timedelta

from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, Throttled

from apps.chat.conf import _get
from apps.sessions.models import ConsultationSession

S = ConsultationSession.Status
ACTIVE_CALL = (S.AWAITING_PAYMENT, S.PAID, S.IN_PROGRESS)
BOOKED = (S.AWAITING_PAYMENT, S.PAID, S.IN_PROGRESS, S.COMPLETED, S.CANCELLED, S.REFUNDED)


def new_per_day() -> int:
    return _get("DIALOG_NEW_PER_DAY", 5)


def first_messages() -> int:
    return _get("DIALOG_FIRST_MESSAGES", 3)


def free_cancel_hours() -> int:
    """Одно правило для всех: если подключён apps.billing — берём его BILLING_FREE_CANCEL_HOURS."""
    from django.apps import apps

    if apps.is_installed("apps.billing"):
        try:
            from apps.billing.conf import free_cancel_hours as billing_hours

            return billing_hours()
        except ImportError:
            pass
    return _get("DIALOG_FREE_CANCEL_HOURS", 24)


def late_penalty_percent() -> int | None:
    from django.apps import apps

    if apps.is_installed("apps.billing"):
        try:
            from apps.billing.conf import late_cancel_penalty_percent

            return late_cancel_penalty_percent()
        except ImportError:
            pass
    return None


def rules() -> dict:
    return {"free_cancel_hours": free_cancel_hours(), "late_penalty_percent": late_penalty_percent(),
            "first_messages": first_messages()}


def pair_calls(client_id, profile_id):
    return ConsultationSession.objects.filter(client_id=client_id, psychologist_profile_id=profile_id)


def has_booking(client_id, profile_id) -> bool:
    return pair_calls(client_id, profile_id).filter(status__in=BOOKED).exists()


# ── Начать диалог ─────────────────────────────────────────────────────────────

def check_new_dialogue(client) -> None:
    """Клиент начинает новый диалог без записи: не больше N за сутки."""
    from apps.chat.models import Conversation

    since = timezone.now() - timedelta(hours=24)
    started = Conversation.objects.filter(
        kind=Conversation.Kind.SPECIALIST, client=client, created_at__gte=since,
    ).count()
    if started >= new_per_day():
        raise Throttled(detail="Сегодня вы уже начали несколько новых диалогов. Продолжите их или попробуйте завтра.")


# ── Писать в диалог ───────────────────────────────────────────────────────────

def first_messages_left(conv, role: str) -> int | None:
    """None — ограничений нет; иначе сколько сообщений клиент ещё может отправить до ответа специалиста."""
    from apps.chat.models import Conversation, Message

    if conv.kind != Conversation.Kind.SPECIALIST or role != "client":
        return None
    msgs = Message.objects.filter(conversation=conv)
    if msgs.filter(sender_role=Message.SenderRole.SPECIALIST).exists():
        return None
    if has_booking(conv.client_id, conv.specialist_id):
        return None
    sent = msgs.filter(sender_role=Message.SenderRole.CLIENT).count()
    return max(0, first_messages() - sent)


def check_send(conv, role: str) -> None:
    left = first_messages_left(conv, role)
    if left is not None and left <= 0:
        raise PermissionDenied(
            "Специалист ещё не ответил. Дождитесь ответа или назначьте созвон — после этого ограничений не будет."
        )


# ── Отмена и перенос ─────────────────────────────────────────────────────────

def free_until(session):
    return session.scheduled_at - timedelta(hours=free_cancel_hours())


def is_late(session, now=None) -> bool:
    return (now or timezone.now()) > free_until(session)


def can_cancel(session, role: str, now=None) -> bool:
    now = now or timezone.now()
    return session.status in (S.AWAITING_PAYMENT, S.PAID) and now < session.scheduled_at and role in (
        "client", "specialist")


def can_reschedule(session, role: str, now=None) -> bool:
    """Клиент переносит бесплатно до free_until; специалист — в любой момент до начала."""
    now = now or timezone.now()
    if session.status not in (S.AWAITING_PAYMENT, S.PAID) or now >= session.scheduled_at:
        return False
    if role == "client":
        return not is_late(session, now)
    return role == "specialist"
