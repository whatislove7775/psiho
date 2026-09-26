"""
Бизнес-логика «Кругов»: расписание, публикация, участие, лист ожидания, деньги, чат, расчёт встреч.

Деньги (apps.billing, без форка): каждая оплачиваемая единица участника — отдельная
заморозка Hold (billing.services.hold_for_group) с уникальным ref:
  - billing=per_meeting — одна заморозка на каждую будущую встречу (списывается после встречи);
  - billing=series      — одна заморозка на весь цикл (списывается после первой состоявшейся встречи).
Отмена участником — release_for_call(ref, "client_cancel"): те же правила, что у созвонов
(бесплатно не позже чем за N часов до встречи, позже — штраф в %). Ведущий не пришёл,
ведущий отменил круг или исключил участника — полный возврат.
"""
from __future__ import annotations

import logging
import random
from datetime import timedelta

from django.core.cache import cache
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.billing import services as billing
from apps.billing.ledger import InsufficientFunds
from apps.billing.models import Hold

from .models import Charge, Circle, CircleMessage, Meeting, Membership

logger = logging.getLogger(__name__)

S = Circle.Status
MS = Meeting.Status
M = Membership.Status

JOIN_BEFORE_MINUTES = 10  # комната открывается за 10 минут до начала
ROOM_GRACE_MINUTES = 15  # и закрывается через 15 минут после конца
SETTLE_GRACE_MINUTES = 15
MAX_MEETINGS = 12
MIN_LEAD_HOURS = 24  # первая встреча — не раньше чем через сутки после отправки на проверку
PRICE_MIN_RUB = 300
PRICE_MAX_RUB = 60000

ANIMALS = [
    ("Лиса", "coral"), ("Сова", "lilac"), ("Кит", "cyan"), ("Ёж", "sun"), ("Выдра", "mint"),
    ("Олень", "coral"), ("Панда", "lilac"), ("Енот", "cyan"), ("Белка", "sun"), ("Бобр", "mint"),
    ("Пингвин", "cyan"), ("Лось", "coral"), ("Зубр", "lilac"), ("Тюлень", "cyan"), ("Журавль", "mint"),
    ("Филин", "sun"), ("Барсук", "coral"), ("Коала", "mint"), ("Рысь", "sun"), ("Дельфин", "cyan"),
    ("Медведь", "coral"), ("Кролик", "lilac"), ("Ёлка", "mint"), ("Воробей", "sun"),
]

DEFAULT_RULES = (
    "Всё, что звучит в круге, остаётся в круге.\n"
    "Говорим о себе, не даём советов, если о них не просили.\n"
    "Не пытаемся узнать, кто есть кто, и не делимся контактами.\n"
    "Можно просто слушать — говорить не обязательно.\n"
    "Не записываем встречи и не делаем скриншоты."
)


class CircleError(Exception):
    def __init__(self, message: str, code: str = "circle_error", http: int = 400, **extra):
        super().__init__(message)
        self.message = message
        self.code = code
        self.http = http
        self.extra = extra


# ── Псевдонимы ────────────────────────────────────────────────────────

def pick_pseudonym(circle: Circle) -> tuple[str, str]:
    """Свежий псевдоним «Участник-Лиса», уникальный в этом круге (и не связанный с аккаунтом)."""
    used = set(Membership.objects.filter(circle=circle).values_list("pseudonym", flat=True))
    options = [(f"Участник-{a}", t) for a, t in ANIMALS if f"Участник-{a}" not in used]
    rng = random.SystemRandom()
    if options:
        return rng.choice(options)
    a, t = rng.choice(ANIMALS)
    n = 2
    while f"Участник-{a} {n}" in used:
        n += 1
    return f"Участник-{a} {n}", t


# ── Расписание и публикация ───────────────────────────────────────────

def set_schedule(circle: Circle, first_at, count: int, interval_days: int = 7) -> list[Meeting]:
    if circle.format == Circle.Format.SINGLE:
        count = 1
    count = max(1, min(int(count), MAX_MEETINGS))
    circle.meetings.all().delete()
    return [
        Meeting.objects.create(circle=circle, index=i + 1, starts_at=first_at + timedelta(days=interval_days * i))
        for i in range(count)
    ]


def active_meetings(circle: Circle):
    return circle.meetings.exclude(status=MS.CANCELLED).order_by("starts_at")


def first_meeting(circle: Circle) -> Meeting | None:
    return active_meetings(circle).first()


def submit(circle: Circle) -> Circle:
    if circle.status not in Circle.EDITABLE:
        raise CircleError("Этот круг уже отправлен на проверку.")
    from apps.users.models import PsychologistProfile

    if circle.host.verification_status != PsychologistProfile.VerificationStatus.APPROVED:
        raise CircleError("Круги могут вести только проверенные специалисты.")
    first = first_meeting(circle)
    if first is None:
        raise CircleError("Добавьте расписание встреч.")
    if first.starts_at < timezone.now() + timedelta(hours=MIN_LEAD_HOURS):
        raise CircleError("Первая встреча должна быть не раньше чем через сутки: нужно время на проверку и набор.")
    circle.status = S.PENDING
    circle.submitted_at = timezone.now()
    circle.review_comment = ""
    circle.save(update_fields=["status", "submitted_at", "review_comment", "updated_at"])
    return circle


def review(circle: Circle, decision: str, *, by, comment: str = "") -> Circle:
    if circle.status != S.PENDING:
        raise CircleError("Этот круг уже проверен.")
    now = timezone.now()
    if decision == "approve":
        first = first_meeting(circle)
        if first is None or first.starts_at <= now + timedelta(hours=1):
            raise CircleError("Первая встреча уже слишком близко — верните круг специалисту, чтобы он сдвинул даты.")
        circle.status = S.RECRUITING
    else:
        circle.status = S.REJECTED
    circle.review_comment = comment.strip()[:2000]
    circle.reviewed_by = by
    circle.reviewed_at = now
    circle.save(update_fields=["status", "review_comment", "reviewed_by", "reviewed_at", "updated_at"])
    if circle.status == S.RECRUITING:
        system_message(circle, "Круг открыт для записи. Здесь можно познакомиться и задать вопросы ведущему.")
    return circle


def refresh_status(circle: Circle, now=None) -> Circle:
    """recruiting → running (началась первая встреча) → finished (закончилась последняя)."""
    if circle.status not in (S.RECRUITING, S.RUNNING):
        return circle
    now = now or timezone.now()
    meetings = list(active_meetings(circle))
    if not meetings:
        return circle
    new = circle.status
    if meetings[-1].ends_at <= now or all(m.status in (MS.DONE, MS.MISSED) for m in meetings):
        new = S.FINISHED
    elif meetings[0].starts_at <= now:
        new = S.RUNNING
    if new != circle.status:
        circle.status = new
        circle.save(update_fields=["status", "updated_at"])
    return circle


# ── Места и оплата ────────────────────────────────────────────────────

def seats_taken(circle: Circle) -> int:
    return circle.memberships.filter(status=M.ACTIVE).count()


def future_meetings(circle: Circle, now=None):
    now = now or timezone.now()
    return active_meetings(circle).filter(status=MS.SCHEDULED, starts_at__gt=now)


def join_closed_reason(circle: Circle, now=None) -> str | None:
    now = now or timezone.now()
    if circle.status == S.RECRUITING:
        pass
    elif circle.status == S.RUNNING:
        if circle.billing == Circle.Billing.SERIES:
            return "Цикл уже начался — запись закрыта. Загляните в другие круги."
    else:
        return "Запись в этот круг закрыта."
    if not future_meetings(circle, now).exists():
        return "Встреч для записи больше нет."
    return None


def amount_due(circle: Circle, now=None) -> int:
    if circle.billing == Circle.Billing.SERIES:
        return int(circle.price_kopecks)
    return int(circle.price_kopecks) * future_meetings(circle, now).count()


def _create_charges(membership: Membership, now=None) -> list[Charge]:
    """Заморозить оплату участника. Всё или ничего (вызывать внутри transaction.atomic)."""
    circle = membership.circle
    specialist = circle.host.user
    charges = []
    meta = {"circle": str(circle.id)}
    if circle.billing == Circle.Billing.SERIES:
        first = first_meeting(circle)
        charge = Charge.objects.create(membership=membership, meeting=None, amount_kopecks=circle.price_kopecks)
        billing.hold_for_group(
            ref=charge.ref, client=membership.user, specialist=specialist, amount_kopecks=charge.amount_kopecks,
            scheduled_at=first.starts_at, duration_minutes=circle.meeting_minutes,
            memo=f"Круг «{circle.title[:60]}»: весь цикл", metadata=meta,
        )
        charges.append(charge)
    else:
        for meeting in future_meetings(circle, now):
            charge = Charge.objects.create(membership=membership, meeting=meeting, amount_kopecks=circle.price_kopecks)
            billing.hold_for_group(
                ref=charge.ref, client=membership.user, specialist=specialist, amount_kopecks=charge.amount_kopecks,
                scheduled_at=meeting.starts_at, duration_minutes=circle.meeting_minutes,
                memo=f"Круг «{circle.title[:60]}»: встреча {meeting.index}", metadata=meta,
            )
            charges.append(charge)
    return charges


def join(circle: Circle, user) -> tuple[Membership, bool]:
    """Записаться. Возвращает (участие, попал_в_лист_ожидания). InsufficientFunds — не хватает денег."""
    if getattr(user, "role", "") != "client":
        raise CircleError("Записаться в круг можно из кабинета клиента.", "not_client", 403)
    with transaction.atomic():
        circle = Circle.objects.select_for_update().select_related("host__user").get(pk=circle.pk)
        refresh_status(circle)
        reason = join_closed_reason(circle)
        if reason:
            raise CircleError(reason, "closed")
        m = Membership.objects.filter(circle=circle, user=user).first()
        if m is not None:
            if m.status in (M.ACTIVE, M.WAITLIST):
                return m, m.status == M.WAITLIST
            if m.status == M.REMOVED:
                raise CircleError("Ведущий исключил вас из этого круга.", "removed", 403)
        full = seats_taken(circle) >= circle.capacity
        if m is None:
            name, tone = pick_pseudonym(circle)
            m = Membership(circle=circle, user=user, pseudonym=name, tone=tone)
        m.status = M.WAITLIST if full else M.ACTIVE
        m.joined_at = timezone.now()
        m.waitlisted_at = timezone.now() if full else None
        m.left_at = None
        m.promote_failed_at = None
        m.save()
        if full:
            return m, True
        _create_charges(m)  # InsufficientFunds откатывает всю транзакцию
    system_message(circle, f"{m.pseudonym} присоединяется к кругу. Добро пожаловать!")
    return m, False


def _releasable(charge: Charge, now) -> Hold | None:
    """Заморозка, которую участник ещё может вернуть (встреча не началась)."""
    hold = Hold.objects.filter(session_ref=charge.ref, status=Hold.Status.ACTIVE).first()
    if hold is None:
        return None
    start = charge.meeting.starts_at if charge.meeting_id else (hold.scheduled_at or now)
    if start <= now:
        return None
    return hold


def leave_terms(membership: Membership, now=None) -> dict:
    """Что будет с деньгами, если выйти сейчас: вернётся / штраф / остаётся (встреча уже идёт)."""
    now = now or timezone.now()
    refund = penalty = kept = 0
    for charge in membership.charges.select_related("meeting"):
        hold = Hold.objects.filter(session_ref=charge.ref, status=Hold.Status.ACTIVE).first()
        if hold is None:
            continue
        if _releasable(charge, now) is None:
            kept += hold.amount_kopecks
            continue
        p = billing.cancel_penalty_kopecks(hold, now)
        penalty += p
        refund += hold.amount_kopecks - p
    return {"refund_kopecks": refund, "penalty_kopecks": penalty, "kept_kopecks": kept}


def _release_future(membership: Membership, reason: str, now=None) -> None:
    now = now or timezone.now()
    for charge in membership.charges.select_related("meeting"):
        if _releasable(charge, now) is not None:
            billing.release_for_call(charge.ref, reason)


def leave(membership: Membership) -> Membership:
    circle = membership.circle
    with transaction.atomic():
        m = Membership.objects.select_for_update().get(pk=membership.pk)
        if m.status not in (M.ACTIVE, M.WAITLIST):
            return m
        was_active = m.status == M.ACTIVE
        if was_active:
            _release_future(m, "client_cancel")
        m.status = M.LEFT
        m.left_at = timezone.now()
        m.save(update_fields=["status", "left_at"])
    if was_active:
        system_message(circle, f"{m.pseudonym} выходит из круга. Спасибо, что были с нами.")
        kick_peer(circle, m.handle)
        promote_waitlist(circle)
    return m


def remove_member(membership: Membership, *, by=None) -> Membership:
    """Ведущий исключает участника: будущие встречи возвращаются целиком."""
    circle = membership.circle
    with transaction.atomic():
        m = Membership.objects.select_for_update().get(pk=membership.pk)
        if m.status not in (M.ACTIVE, M.WAITLIST):
            return m
        was_active = m.status == M.ACTIVE
        if was_active:
            _release_future(m, "specialist_cancel")
        m.status = M.REMOVED
        m.left_at = timezone.now()
        m.save(update_fields=["status", "left_at"])
    if was_active:
        system_message(circle, f"Ведущий попросил {m.pseudonym} покинуть круг.")
        kick_peer(circle, m.handle)
        promote_waitlist(circle)
    return m


def promote_waitlist(circle: Circle) -> int:
    """Освободилось место → первый из листа ожидания, у кого хватает денег, становится участником."""
    promoted = 0
    circle.refresh_from_db()
    if join_closed_reason(circle):
        return 0
    for m in circle.memberships.filter(status=M.WAITLIST).order_by("waitlisted_at", "joined_at"):
        if seats_taken(circle) >= circle.capacity:
            break
        try:
            with transaction.atomic():
                locked = Membership.objects.select_for_update().get(pk=m.pk)
                if locked.status != M.WAITLIST:
                    continue
                locked.status = M.ACTIVE
                locked.promote_failed_at = None
                locked.save(update_fields=["status", "promote_failed_at"])
                _create_charges(locked)
        except InsufficientFunds:
            Membership.objects.filter(pk=m.pk).update(promote_failed_at=timezone.now())
            continue
        promoted += 1
        system_message(circle, f"{m.pseudonym} присоединяется к кругу из листа ожидания.")
    return promoted


def waitlist_position(membership: Membership) -> int | None:
    if membership.status != M.WAITLIST:
        return None
    ahead = membership.circle.memberships.filter(status=M.WAITLIST).filter(
        Q(waitlisted_at__lt=membership.waitlisted_at)
        | Q(waitlisted_at=membership.waitlisted_at, joined_at__lt=membership.joined_at)
    ).count()
    return ahead + 1


def cancel_circle(circle: Circle, *, by=None, who: str = "specialist", reason: str = "") -> Circle:
    """Отмена круга: все будущие и неиспользованные оплаты — полный возврат."""
    if circle.status in (S.CANCELLED, S.FINISHED):
        raise CircleError("Этот круг уже закрыт.")
    release_reason = "staff_cancel" if who == "staff" else "specialist_cancel"
    with transaction.atomic():
        circle.status = S.CANCELLED
        circle.cancel_reason = reason.strip()[:300]
        circle.save(update_fields=["status", "cancel_reason", "updated_at"])
        circle.meetings.filter(status__in=[MS.SCHEDULED, MS.LIVE]).update(status=MS.CANCELLED)
        for charge in Charge.objects.filter(membership__circle=circle):
            billing.release_for_call(charge.ref, release_reason)
    system_message(circle, "Круг отменён. Деньги за встречи, которые не состоялись, вернулись на баланс.")
    for m in circle.memberships.filter(status=M.ACTIVE):
        kick_peer(circle, m.handle)
    return circle


def charges_summary(membership: Membership) -> dict:
    holds = {h.session_ref: h for h in Hold.objects.filter(session_ref__in=membership.charges.values("ref"))}
    paid = held = returned = 0
    for h in holds.values():
        if h.status == Hold.Status.ACTIVE:
            held += h.amount_kopecks
        else:
            paid += h.specialist_kopecks + h.fee_kopecks
            returned += h.returned_kopecks
    return {"held_kopecks": held, "paid_kopecks": paid, "returned_kopecks": returned}


# ── Встречи ───────────────────────────────────────────────────────────

def room_open(meeting: Meeting, now=None) -> str | None:
    """None — можно войти; иначе объяснение, почему нельзя."""
    now = now or timezone.now()
    circle = meeting.circle
    if circle.status in (S.CANCELLED,) or meeting.status in (MS.CANCELLED, MS.MISSED):
        return "Эта встреча отменена."
    if meeting.status == MS.DONE or meeting.ended_at:
        return "Эта встреча уже закончилась."
    if now < meeting.starts_at - timedelta(minutes=JOIN_BEFORE_MINUTES):
        return f"Комната откроется за {JOIN_BEFORE_MINUTES} минут до начала."
    if now > meeting.ends_at + timedelta(minutes=ROOM_GRACE_MINUTES):
        return "Эта встреча уже закончилась."
    return None


def mark_host_joined(meeting: Meeting) -> None:
    if meeting.host_joined_at is None or meeting.status == MS.SCHEDULED:
        Meeting.objects.filter(pk=meeting.pk, host_joined_at__isnull=True).update(host_joined_at=timezone.now())
        Meeting.objects.filter(pk=meeting.pk, status=MS.SCHEDULED).update(status=MS.LIVE)
        meeting.refresh_from_db()
        refresh_status(meeting.circle)


def end_meeting(meeting: Meeting) -> Meeting:
    """Ведущий завершил встречу: закрыть комнату и сразу рассчитать оплату."""
    if meeting.ended_at is None:
        meeting.ended_at = timezone.now()
        meeting.save(update_fields=["ended_at"])
    settle_meeting(meeting, force=True)
    end_room(meeting)
    return meeting


def settle_meeting(meeting: Meeting, *, force: bool = False, now=None) -> bool:
    """Встреча прошла → списать; ведущий не пришёл → вернуть. Идемпотентно."""
    now = now or timezone.now()
    circle = meeting.circle
    if meeting.settled or meeting.status == MS.CANCELLED:
        return False
    if not force and meeting.ends_at + timedelta(minutes=SETTLE_GRACE_MINUTES) > now:
        return False
    with transaction.atomic():
        meeting = Meeting.objects.select_for_update().get(pk=meeting.pk)
        if meeting.settled:
            return False
        held = meeting.host_joined_at is not None
        meeting.status = MS.DONE if held else MS.MISSED
        meeting.settled = True
        meeting.ended_at = meeting.ended_at or now
        meeting.save(update_fields=["status", "settled", "ended_at"])
        for charge in Charge.objects.filter(meeting=meeting):
            if held:
                billing.capture_for_call(charge.ref, reason="circle_meeting")
            else:
                billing.release_for_call(charge.ref, "specialist_no_show")
        if circle.billing == Circle.Billing.SERIES:
            series = Charge.objects.filter(membership__circle=circle, meeting__isnull=True)
            if held:
                for charge in series:
                    billing.capture_for_call(charge.ref, reason="circle_series")
            elif not active_meetings(circle).filter(settled=False).exclude(pk=meeting.pk).exists() and \
                    not active_meetings(circle).filter(status=MS.DONE).exists():
                # Ни одна встреча цикла не состоялась — вернуть всё
                for charge in series:
                    billing.release_for_call(charge.ref, "specialist_no_show")
    refresh_status(circle, now)
    return True


# ── Фоновый расчёт ────────────────────────────────────────────────────

def sweep(now=None) -> dict:
    now = now or timezone.now()
    settled = 0
    due = Meeting.objects.filter(settled=False).exclude(status=MS.CANCELLED).filter(
        starts_at__lte=now - timedelta(minutes=SETTLE_GRACE_MINUTES),
    ).select_related("circle")[:200]
    for meeting in due:
        try:
            if settle_meeting(meeting, now=now):
                settled += 1
        except Exception:  # pragma: no cover — одна встреча не должна ломать остальные
            logger.exception("circles: settle meeting %s failed", meeting.pk)
    refreshed = 0
    for circle in Circle.objects.filter(status__in=[S.RECRUITING, S.RUNNING]):
        before = circle.status
        if refresh_status(circle, now).status != before:
            refreshed += 1
    purged = purge_messages(now)
    return {"meetings_settled": settled, "circles_updated": refreshed, "messages_purged": purged}


def maybe_sweep() -> None:
    if cache.add("circles:sweep-lock", 1, timeout=60):
        try:
            sweep()
        except Exception:  # pragma: no cover
            logger.exception("circles sweep failed")


# ── Чат ──────────────────────────────────────────────────────────────

RETENTION = {"1h": timedelta(hours=1), "24h": timedelta(days=1)}


def chat_role(circle: Circle, user) -> tuple[str | None, Membership | None]:
    """("host" | "member" | None, участие)."""
    if not user or not user.is_authenticated:
        return None, None
    if circle.host.user_id == user.pk:
        return "host", None
    m = Membership.objects.filter(circle=circle, user=user, status=M.ACTIVE).first()
    return ("member", m) if m else (None, None)


def chat_writable(circle: Circle) -> bool:
    return circle.status in (S.RECRUITING, S.RUNNING)


def expires_for(circle: Circle, now=None):
    delta = RETENTION.get(circle.chat_retention)
    return (now or timezone.now()) + delta if delta else None


def visible_messages(circle: Circle, now=None):
    now = now or timezone.now()
    return circle.messages.filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now)).select_related("author")


def purge_messages(now=None) -> int:
    now = now or timezone.now()
    n, _ = CircleMessage.objects.filter(expires_at__lte=now).delete()
    return n


def system_message(circle: Circle, text: str) -> CircleMessage:
    from apps.chat.crypto import encrypt_text

    msg = CircleMessage.objects.create(
        circle=circle, role=CircleMessage.Role.SYSTEM, text_enc=encrypt_text(text), expires_at=expires_for(circle),
    )
    broadcast(circle, {"type": "circle.message", "circle": str(circle.id), "message": serialize_message(msg, None)})
    return msg


def post_message(circle: Circle, user, text: str) -> CircleMessage:
    from apps.chat.crypto import encrypt_text

    role, m = chat_role(circle, user)
    if role is None:
        raise CircleError("Чат круга доступен только участникам и ведущему.", "forbidden", 403)
    if not chat_writable(circle):
        raise CircleError("Круг закрыт — чат доступен только для чтения.", "read_only", 403)
    if m is not None and m.chat_muted:
        raise CircleError("Ведущий временно выключил вам сообщения в чате.", "muted", 403)
    text = (text or "").strip()
    if not text:
        raise CircleError("Напишите сообщение.")
    if len(text) > 2000:
        raise CircleError("Сообщение длиннее 2000 символов.")
    msg = CircleMessage.objects.create(
        circle=circle, author=m, role=CircleMessage.Role.HOST if role == "host" else CircleMessage.Role.MEMBER,
        text_enc=encrypt_text(text), expires_at=expires_for(circle),
    )
    broadcast(circle, {"type": "circle.message", "circle": str(circle.id), "message": serialize_message(msg, None)},
              sender_id=user.pk)
    return msg


def delete_message(msg: CircleMessage, user) -> CircleMessage:
    circle = msg.circle
    role, m = chat_role(circle, user)
    own = m is not None and msg.author_id == m.pk
    host_own = role == "host" and msg.role == CircleMessage.Role.HOST
    if not (own or host_own or role == "host") or msg.role == CircleMessage.Role.SYSTEM:
        raise CircleError("Удалить можно только своё сообщение.", "forbidden", 403)
    msg.deleted_at = timezone.now()
    msg.text_enc = b""
    msg.save(update_fields=["deleted_at", "text_enc"])
    broadcast(circle, {"type": "circle.message.deleted", "circle": str(circle.id), "id": str(msg.id)})
    return msg


def serialize_message(msg: CircleMessage, viewer_membership_id) -> dict:
    """Автор — только псевдоним/handle (участник) или имя ведущего. Никаких id пользователей."""
    from apps.chat.crypto import decrypt_text

    if msg.role == CircleMessage.Role.HOST:
        author = {"kind": "host", "name": msg.circle.host.display_name, "handle": "host", "tone": "primary"}
    elif msg.role == CircleMessage.Role.MEMBER:
        a = msg.author
        author = {"kind": "member", "name": a.pseudonym if a else "Бывший участник", "handle": a.handle if a else "",
                  "tone": a.tone if a else "lilac"}
    else:
        author = {"kind": "system", "name": "Круг", "handle": "", "tone": "neutral"}
    data = {
        "id": str(msg.id),
        "author": author,
        "text": "" if msg.deleted_at else decrypt_text(msg.text_enc),
        "deleted": bool(msg.deleted_at),
        "created_at": msg.created_at.isoformat(),
        "expires_at": msg.expires_at.isoformat() if msg.expires_at else None,
    }
    if viewer_membership_id is not None:
        data["mine"] = bool(msg.author_id and msg.author_id == viewer_membership_id)
    return data


def audience_user_ids(circle: Circle) -> list:
    ids = list(circle.memberships.filter(status=M.ACTIVE).values_list("user_id", flat=True))
    ids.append(circle.host.user_id)
    return ids


def broadcast(circle: Circle, event: dict, *, sender_id=None) -> None:
    """Через общий WebSocket чатов (/ws/chat/, apps.chat): событие каждому участнику и ведущему.

    "_sender" сервер чатов превращает в поле message.mine и не отдаёт наружу.
    """
    from apps.chat.services import send_to_user

    payload = dict(event)
    if sender_id is not None:
        payload["_sender"] = str(sender_id)
    for uid in audience_user_ids(circle):
        try:
            send_to_user(uid, payload)
        except Exception:  # pragma: no cover — нет канального слоя
            logger.debug("circles: broadcast failed", exc_info=True)


# ── Сигналинг (apps.signaling.group) ─────────────────────────────────

def _group_send(room_id, event: dict) -> None:
    from asgiref.sync import async_to_sync
    from channels.layers import get_channel_layer

    layer = get_channel_layer()
    if layer is None:
        return
    try:
        async_to_sync(layer.group_send)(f"gsig_{str(room_id).replace('-', '')}", event)
    except Exception:  # pragma: no cover
        logger.debug("circles: group send failed", exc_info=True)


def kick_peer(circle: Circle, handle: str) -> None:
    for room_id in circle.meetings.filter(status__in=[MS.SCHEDULED, MS.LIVE]).values_list("room_id", flat=True):
        _group_send(room_id, {"type": "peer.kick", "peer": handle})


def end_room(meeting: Meeting) -> None:
    _group_send(meeting.room_id, {"type": "room.end"})
