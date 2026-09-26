"""Диалоги поверх чатов и созвонов: список, карточка, назначение, перенос, отмена, предложения."""
import logging
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from apps.availability import services as availability
from apps.chat import services as chat
from apps.chat.crypto import decrypt_text, encrypt_text
from apps.chat.models import Conversation, Message
from apps.photos.utils import photo_url
from apps.sessions.models import ConsultationSession, SessionEvent
from apps.sessions.serializers import can_join
from apps.users.models import PsychologistProfile

from . import policy
from .cards import call_brief, proposal_brief
from .models import CallProposal, SpecialistNote

logger = logging.getLogger(__name__)

Kind = Conversation.Kind
S = ConsultationSession.Status


class CallError(ValidationError):
    """Понятная ошибка записи (время заняли, не по правилам и т.д.)."""


# ── Оплата: C3 (apps.billing) или прежний поток YooKassa ──────────────────────

def billing():
    from django.apps import apps

    if not apps.is_installed("apps.billing"):
        return None
    try:
        from apps.billing import services as b
    except ImportError:
        return None
    return b


def pay_mode() -> str:
    """balance — оплата с анонимного баланса (apps.billing); external — прежняя оплата по ссылке."""
    return "balance" if billing() else "external"


def _is_insufficient(b, exc) -> bool:
    classes = [getattr(b, "InsufficientFunds", None)]
    try:
        from apps.billing.ledger import InsufficientFunds

        classes.append(InsufficientFunds)
    except ImportError:
        pass
    return any(c and isinstance(exc, c) for c in classes)


def _pay(session: ConsultationSession) -> None:
    from apps.payments.services import initiate_payment, mark_session_paid

    b = billing()
    if b is None:
        initiate_payment(session)  # dev: сразу paid; YooKassa: awaiting_payment + ссылка
        return
    session.status = S.AWAITING_PAYMENT
    session.save(update_fields=["status", "updated_at"])
    try:
        with transaction.atomic():
            b.hold_for_call(session)
    except Exception as exc:  # noqa: BLE001
        if _is_insufficient(b, exc):
            return  # клиент пополнит баланс и оплатит из карточки (PayForCall)
        raise
    session.refresh_from_db()
    if session.status == S.AWAITING_PAYMENT:
        mark_session_paid(session, {"mode": "balance"})


def _release(session: ConsultationSession, *, role: str, late: bool) -> str:
    """Возвращает деньги за отменённый созвон. «full» — полностью, «partial» — за вычетом штрафа, «none»."""
    b = billing()
    if session.status != S.PAID:
        return "none"
    if b is not None:
        # Штраф за позднюю отмену клиентом считает apps.billing (BILLING_LATE_CANCEL_PENALTY_PERCENT)
        b.release_for_call(session, f"cancelled_by_{role}{'_late' if late else ''}")
    return "partial" if late else "full"


# ── Диалог = чат пары ─────────────────────────────────────────────────────────

def ensure_dialogue(client, profile) -> Conversation:
    try:
        with transaction.atomic():
            conv, _ = Conversation.objects.get_or_create(kind=Kind.SPECIALIST, client=client, specialist=profile)
    except IntegrityError:
        conv = Conversation.objects.get(kind=Kind.SPECIALIST, client=client, specialist=profile)
    return conv


def dialogue_id_for(session: ConsultationSession) -> str | None:
    cid = Conversation.objects.filter(
        kind=Kind.SPECIALIST, client_id=session.client_id, specialist_id=session.psychologist_profile_id,
    ).values_list("id", flat=True).first()
    return str(cid) if cid else None


def backfill_for(user) -> None:
    """Созвоны, записанные до появления диалогов, получают свой диалог."""
    if user.role == "client":
        qs = ConsultationSession.objects.filter(client=user)
    elif chat.is_specialist(user):
        qs = ConsultationSession.objects.filter(psychologist_profile=user.psychologist_profile)
    else:
        return
    pairs = set(qs.exclude(status=S.DRAFT).values_list("client_id", "psychologist_profile_id"))
    if not pairs:
        return
    have = set(Conversation.objects.filter(kind=Kind.SPECIALIST).filter(
        Q(client=user) | Q(specialist__user=user)).values_list("client_id", "specialist_id"))
    for client_id, profile_id in pairs - have:
        try:
            with transaction.atomic():
                Conversation.objects.get_or_create(kind=Kind.SPECIALIST, client_id=client_id, specialist_id=profile_id)
        except IntegrityError:
            pass


def get_dialogue(user, pk) -> tuple[Conversation, str]:
    """Только участники; сотрудники и посторонние получают 404 (не раскрываем существование)."""
    conv = Conversation.objects.select_related("client", "specialist", "specialist__user").filter(
        pk=pk, kind=Kind.SPECIALIST).first()
    if conv is None:
        raise NotFound("Диалог не найден.")
    role = chat.my_role(user, conv)
    if role not in ("client", "specialist"):
        raise NotFound("Диалог не найден.")
    return conv, role


def calls_of(conv: Conversation):
    return policy.pair_calls(conv.client_id, conv.specialist_id).exclude(status=S.DRAFT)


def next_call(conv: Conversation, now=None):
    now = now or timezone.now()
    for s in calls_of(conv).filter(status__in=policy.ACTIVE_CALL).order_by("scheduled_at"):
        if s.scheduled_at + timedelta(minutes=s.duration_minutes + 15) > now:
            return s
    return None


def call_data(session: ConsultationSession, role: str | None = None, now=None) -> dict:
    now = now or timezone.now()
    data = call_brief(session)
    data["ends_at"] = (session.scheduled_at + timedelta(minutes=session.duration_minutes)).isoformat()
    data["free_until"] = policy.free_until(session).isoformat()
    data["completed_at"] = session.completed_at.isoformat() if session.completed_at else None
    if session.status == S.COMPLETED:
        data["actual_minutes"] = actual_minutes(session)
    if role:
        data["can_cancel"] = policy.can_cancel(session, role, now)
        data["can_reschedule"] = policy.can_reschedule(session, role, now)
        data["late_cancel"] = role == "client" and policy.is_late(session, now)
    if role == "client" and session.status == S.AWAITING_PAYMENT:
        payment = getattr(session, "payment", None)  # RelatedObjectDoesNotExist — подкласс AttributeError
        data["payment_url"] = (payment.confirmation_url or None) if payment else None
        data["pay_mode"] = pay_mode()
    return data


def actual_minutes(session: ConsultationSession) -> int | None:
    opened = session.events.filter(event_type=SessionEvent.EventType.ROOM_OPENED).order_by("occurred_at").first()
    end = session.completed_at
    if not opened or not end:
        return None
    return max(1, round((end - opened.occurred_at).total_seconds() / 60))


def counterpart(conv: Conversation, role: str, rich: bool = False) -> dict:
    who = chat.counterpart(conv, role)
    if who["type"] == "specialist":
        sp = conv.specialist
        who["photo_url"] = photo_url(sp)
        if rich:
            who.update({
                "bio": sp.bio,
                "specializations": sp.specializations,
                "experience_years": sp.experience_years,
            })
    return who


def status_of(conv: Conversation, nxt, pending_proposal: bool) -> str:
    if nxt is not None:
        if nxt.status == S.IN_PROGRESS or can_join(nxt):
            return "live"
        if nxt.status == S.AWAITING_PAYMENT:
            return "awaiting_payment"
        return "scheduled"
    if pending_proposal:
        return "proposal"
    return "open"


def _pending_proposals(conv):
    return CallProposal.objects.filter(conversation=conv, status=CallProposal.Status.PENDING,
                                       scheduled_at__gt=timezone.now())


def list_item(conv: Conversation, user, role: str | None = None) -> dict:
    base = chat.serialize_conversation(conv, user, role)
    role = base["my_role"]
    item = {
        "id": base["id"],
        "conversation_id": base["id"],
        "kind": "specialist" if conv.kind == Kind.SPECIALIST else ("ai" if conv.kind == Kind.AI else "support"),
        "pinned": conv.kind != Kind.SPECIALIST,
        "my_role": role,
        "counterpart": counterpart(conv, role) if conv.kind == Kind.SPECIALIST else base["counterpart"],
        "last_message": base["last_message"],
        "last_message_at": base["last_message_at"] or base["created_at"],
        "unread": base["unread"],
        "retention": base["retention"],
        "next_call": None,
        "calls_count": 0,
        "status": "open",
    }
    if conv.kind == Kind.SPECIALIST:
        nxt = next_call(conv)
        item["next_call"] = call_data(nxt, role) if nxt else None
        item["calls_count"] = calls_of(conv).count()
        item["status"] = status_of(conv, nxt, _pending_proposals(conv).exists())
    return item


def dialogues_for(user) -> list[dict]:
    backfill_for(user)
    convs = list(chat.conversations_for(user).order_by("-last_message_at", "-created_at")[:300])
    items = [list_item(c, user) for c in convs]
    kinds = {c.kind for c in convs}
    virtual = []
    if user.role == "client":
        if Kind.AI not in kinds:
            virtual.append({"id": "ai", "kind": "ai"})
        if Kind.CLIENT_SUPPORT not in kinds:
            virtual.append({"id": "support", "kind": "support"})
    elif chat.is_specialist(user) and Kind.SPECIALIST_SUPPORT not in kinds:
        virtual.append({"id": "support", "kind": "support"})
    for v in virtual:
        is_ai = v["kind"] == "ai"
        items.append({
            "id": v["id"], "conversation_id": None, "kind": v["kind"], "pinned": True,
            "my_role": "client" if user.role == "client" else "specialist",
            "counterpart": {"type": v["kind"], "name": chat.AI_NAME if is_ai else chat.SUPPORT_NAME,
                            "avatar_config": None},
            "last_message": None, "last_message_at": None, "unread": 0, "retention": "forever",
            "next_call": None, "calls_count": 0, "status": "open",
        })
    return items


def files_of(conv: Conversation, user) -> list[dict]:
    msgs = chat.visible_messages(conv, user).filter(
        kind=Message.Kind.FILE, deleted_at__isnull=True).select_related("attachment").order_by("-created_at")[:50]
    out = []
    for m in msgs:
        a = getattr(m, "attachment", None)
        if a is None:
            continue
        out.append({"message_id": str(m.id), "name": decrypt_text(a.name_enc) or "file", "mime": a.mime,
                    "size": a.size, "created_at": m.created_at.isoformat(), "mine": m.sender_id == user.id})
    return out


def detail(conv: Conversation, user, role: str) -> dict:
    data = list_item(conv, user, role)
    data["conversation"] = chat.serialize_conversation(conv, user, role)
    data["counterpart"] = counterpart(conv, role, rich=True)
    calls = list(calls_of(conv).select_related("payment").order_by("-scheduled_at")[:100])
    data["calls"] = [call_data(s, role) for s in calls]
    data["proposals"] = [proposal_brief(p) for p in _pending_proposals(conv)]
    data["files"] = files_of(conv, user)
    data["booking"] = availability.booking_info(conv.specialist, conv.client)
    data["rules"] = policy.rules()
    data["pay_mode"] = pay_mode()
    data["can_book"] = role == "client" and conv.specialist.verification_status == \
        PsychologistProfile.VerificationStatus.APPROVED
    data["can_propose"] = role == "specialist"
    data["first_messages_left"] = policy.first_messages_left(conv, role)
    if data["next_call"]:
        nxt = next((c for c in data["calls"] if c["id"] == data["next_call"]["id"]), None)
        if nxt:
            data["next_call"] = nxt
    return data


# ── Системные карточки ───────────────────────────────────────────────────────

def post_card(conv: Conversation, code: str) -> Message:
    msg = chat.add_system_message(conv, code)
    chat.broadcast_message(conv, msg)
    chat.broadcast(conv, {"type": "dialog.updated", "conversation": str(conv.id)})
    return msg


def post_card_for_session(session: ConsultationSession, code: str) -> None:
    """Для хуков из apps.sessions: ошибки карточек не должны ломать сам созвон."""
    try:
        conv = ensure_dialogue(session.client, session.psychologist_profile)
        post_card(conv, code)
    except Exception:  # noqa: BLE001
        logger.warning("dialogs: failed to post %s card", code.split(":")[1] if ":" in code else "?")


def refresh_card(conv: Conversation, msg: Message | None) -> None:
    if msg is None:
        return
    chat.broadcast_message(conv, msg, "message.updated")
    chat.broadcast(conv, {"type": "dialog.updated", "conversation": str(conv.id)})


# ── Созвоны ──────────────────────────────────────────────────────────────────

def _lock_profile(profile_id) -> PsychologistProfile:
    profile = PsychologistProfile.objects.select_for_update().filter(
        pk=profile_id, verification_status=PsychologistProfile.VerificationStatus.APPROVED,
        user__is_active=True,
    ).first()
    if profile is None:
        raise CallError({"detail": "Специалист сейчас не принимает."})
    return profile


def _duration_or_default(profile, duration):
    if duration is None:
        return availability.allowed_durations(availability.get_settings(profile))[0]
    return int(duration)


def book_call(conv: Conversation, client, start, duration=None) -> ConsultationSession:
    from apps.payments.services import PaymentProviderError, create_session

    try:
        with transaction.atomic():
            profile = _lock_profile(conv.specialist_id)
            duration = _duration_or_default(profile, duration)
            error = availability.check_bookable(profile, start, duration, client=client)
            if error:
                raise CallError({"detail": error})
            session = create_session(client, profile, start, duration)
            _pay(session)
    except IntegrityError:
        raise CallError({"detail": "Это время только что заняли. Выберите другое."})
    except PaymentProviderError:
        raise CallError({"detail": "Не удалось создать платёж. Попробуйте позже."})
    post_card(conv, f"call:booked:{session.id}")
    return session


class _Rollback(Exception):
    pass


def reschedule_call(conv: Conversation, session: ConsultationSession, role: str, start) -> ConsultationSession:
    if not policy.can_reschedule(session, role):
        if role == "client" and policy.is_late(session):
            raise PermissionDenied(
                f"Перенести созвон можно не позднее чем за {policy.free_cancel_hours()} ч до начала. "
                "Напишите специалисту — он может предложить другое время.")
        raise PermissionDenied("Этот созвон уже нельзя перенести.")
    if timezone.is_naive(start):
        start = timezone.make_aware(start)
    if start == session.scheduled_at:
        return session
    original_status = session.status
    try:
        with transaction.atomic():
            profile = _lock_profile(conv.specialist_id)
            # Освобождаем своё время на время проверки, чтобы оно не мешало самому себе
            ConsultationSession.objects.filter(pk=session.pk).update(status=S.CANCELLED)
            error = availability.check_bookable(
                profile, start, session.duration_minutes, client=session.client if role == "client" else None)
            if error:
                raise _Rollback(error)
            ConsultationSession.objects.filter(pk=session.pk).update(
                status=original_status, scheduled_at=start, updated_at=timezone.now(),
                token_expires_at=start + timedelta(hours=24))
    except _Rollback as e:
        raise CallError({"detail": str(e)})
    except IntegrityError:
        raise CallError({"detail": "Это время только что заняли. Выберите другое."})
    session.refresh_from_db()
    post_card(conv, f"call:rescheduled:{session.id}:{role}")
    return session


def cancel_call(conv: Conversation, session: ConsultationSession, role: str) -> dict:
    if not policy.can_cancel(session, role):
        raise PermissionDenied("Этот созвон уже нельзя отменить.")
    late = role == "client" and policy.is_late(session)
    with transaction.atomic():
        session = ConsultationSession.objects.select_for_update().get(pk=session.pk)
        if not policy.can_cancel(session, role):
            raise PermissionDenied("Этот созвон уже нельзя отменить.")
        refund = _release(session, role=role, late=late)
        session.status = S.CANCELLED
        session.save(update_fields=["status", "updated_at"])
        SessionEvent.objects.create(
            session=session, event_type=SessionEvent.EventType.SESSION_ENDED,
            metadata={"cancelled_by": role, "late": late},
        )
    post_card(conv, f"call:cancelled:{session.id}:{role}:{'late' if late else 'free'}")
    return {"call": call_data(session, role), "refund": refund, "late": late}


def get_call(conv: Conversation, sid) -> ConsultationSession:
    session = calls_of(conv).select_related("client", "psychologist_profile").filter(pk=sid).first()
    if session is None:
        raise NotFound("Созвон не найден.")
    return session


# ── Предложения времени от специалиста ───────────────────────────────────────

def propose(conv: Conversation, start, duration) -> CallProposal:
    profile = conv.specialist
    duration = _duration_or_default(profile, duration)
    error = availability.check_bookable(profile, start, duration)
    if error:
        raise CallError({"detail": error})
    p = CallProposal.objects.create(conversation=conv, scheduled_at=start, duration_minutes=duration,
                                    price_rub=availability.price_for(profile, duration))
    p.message = post_card(conv, f"call:proposed:{p.id}")
    p.save(update_fields=["message"])
    return p


def get_proposal(conv: Conversation, pid) -> CallProposal:
    p = CallProposal.objects.select_related("message").filter(pk=pid, conversation=conv).first()
    if p is None:
        raise NotFound("Предложение не найдено.")
    return p


def accept_proposal(conv: Conversation, p: CallProposal, client) -> ConsultationSession:
    if p.status != CallProposal.Status.PENDING or p.scheduled_at <= timezone.now():
        raise CallError({"detail": "Это предложение уже неактуально. Попросите специалиста предложить другое время."})
    session = book_call(conv, client, p.scheduled_at, p.duration_minutes)
    CallProposal.objects.filter(pk=p.pk).update(status=CallProposal.Status.ACCEPTED, session=session,
                                                 decided_at=timezone.now())
    refresh_card(conv, p.message)
    return session


def close_proposal(conv: Conversation, p: CallProposal, role: str) -> CallProposal:
    if p.status != CallProposal.Status.PENDING:
        raise CallError({"detail": "На это предложение уже ответили."})
    p.status = CallProposal.Status.DECLINED if role == "client" else CallProposal.Status.WITHDRAWN
    p.decided_at = timezone.now()
    p.save(update_fields=["status", "decided_at"])
    refresh_card(conv, p.message)
    return p


# ── Заметки специалиста ──────────────────────────────────────────────────────

MAX_NOTE = 10000


def note_of(conv: Conversation) -> dict:
    n = SpecialistNote.objects.filter(specialist_id=conv.specialist_id, client_id=conv.client_id).first()
    return {"text": decrypt_text(n.text_enc) if n else "", "updated_at": n.updated_at.isoformat() if n else None}


def save_note(conv: Conversation, text: str) -> dict:
    text = (text or "")[:MAX_NOTE]
    n, _ = SpecialistNote.objects.get_or_create(specialist_id=conv.specialist_id, client_id=conv.client_id)
    n.text_enc = encrypt_text(text)
    n.save(update_fields=["text_enc", "updated_at"])
    return note_of(conv)


# ── Хуки для apps.sessions (начало и конец созвона) ─────────────────────────

def on_call_started(session: ConsultationSession) -> None:
    post_card_for_session(session, f"call:started:{session.id}")


def on_call_ended(session: ConsultationSession) -> None:
    m = actual_minutes(session)
    post_card_for_session(session, f"call:ended:{session.id}:{m or ''}")


def on_call_booked(session: ConsultationSession) -> None:
    post_card_for_session(session, f"call:booked:{session.id}")
