"""
Жизненный цикл созвона → деньги.

- ConsultationSession перешла в COMPLETED → capture_for_call (в той же транзакции).
- SessionEvent SESSION_ENDED с cancelled_by → release_for_call с причиной
  (client → правило 24 ч, psychologist/staff/system → полный возврат;
  staff с refund=True по уже списанному созвону → возврат с заработка).
- Всё, что пропущено (отмена без события, неявки, «зависшие» созвоны), добирает sweep().
"""
import logging

from django.db import transaction
from django.db.models.signals import post_init, post_save
from django.dispatch import receiver

from apps.sessions.models import ConsultationSession, SessionEvent

logger = logging.getLogger(__name__)


def _safe(fn, *args, **kwargs):
    """Синхронно, в собственной точке сохранения: ошибка денег не ломает запрос (её добирает sweep)."""
    try:
        with transaction.atomic():
            fn(*args, **kwargs)
    except Exception:  # деньги разберёт sweep; запрос пользователя не ломаем
        logger.exception("billing: %s failed", getattr(fn, "__name__", fn))


@receiver(post_init, sender=ConsultationSession)
def _remember_status(sender, instance, **kwargs):
    instance._billing_status = instance.status


@receiver(post_save, sender=ConsultationSession)
def _on_session_saved(sender, instance, created, **kwargs):
    old = getattr(instance, "_billing_status", None)
    instance._billing_status = instance.status
    if created or old == instance.status:
        return
    if instance.status == ConsultationSession.Status.COMPLETED:
        from .services import capture_for_call

        _safe(capture_for_call, instance.pk)


@receiver(post_save, sender=SessionEvent)
def _on_session_event(sender, instance, created, **kwargs):
    if not created or instance.event_type != SessionEvent.EventType.SESSION_ENDED:
        return
    from .services import reason_from_event

    reason = reason_from_event(instance.metadata or {})
    if reason is None:
        return
    session_id = instance.session_id
    refund = bool((instance.metadata or {}).get("refund"))

    def run():
        from .models import Hold
        from .services import refund_captured_call, release_for_call

        hold = Hold.objects.filter(session_ref=session_id).first()
        if hold is None:
            return
        if hold.status == Hold.Status.ACTIVE:
            release_for_call(session_id, reason)
        elif refund and hold.status in (Hold.Status.CAPTURED, Hold.Status.PARTIAL):
            refund_captured_call(hold, reason="staff_refund")

    _safe(run)
