"""Правила доступа, сериализация и рассылка событий чатов."""
import logging
from datetime import timedelta

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db.models import Q
from django.utils import timezone

from .crypto import decrypt_text, encrypt_text
from .models import Conversation, ConversationMember, HiddenMessage, Message

logger = logging.getLogger(__name__)

AI_NAME = "Тиша"
SUPPORT_NAME = "Поддержка aprosop"
SUPPORT_GROUP = "chat_support"
# Роли сотрудников (если в модели пользователя появится staff_role), которым видна поддержка
SUPPORT_STAFF_ROLES = {"owner", "admin", "support"}

Kind = Conversation.Kind


def user_group(user_id) -> str:
    return f"chat_user_{str(user_id).replace('-', '')}"


# ── Роли и доступ ─────────────────────────────────────────────────────────────

def is_support_staff(user) -> bool:
    if not user or not user.is_authenticated:
        return False
    from django.apps import apps

    if apps.is_installed("apps.staff"):
        # Матрица ролей персонала (A5): право "support.inbox" — owner/admin/support
        from apps.staff.roles import has_staff_perm

        return has_staff_perm(user, "support.inbox")
    if not (user.role == "admin" or user.is_staff):
        return False
    staff_role = getattr(user, "staff_role", None)
    if staff_role and staff_role not in SUPPORT_STAFF_ROLES:
        return False
    return True


def is_specialist(user) -> bool:
    return user.role == "psychologist" and hasattr(user, "psychologist_profile")


def my_role(user, conv: Conversation) -> str | None:
    """client / specialist / support — или None, если доступа нет."""
    if conv.kind in (Kind.SPECIALIST, Kind.CLIENT_SUPPORT, Kind.AI) and conv.client_id == user.id:
        return "client"
    if conv.kind in (Kind.SPECIALIST, Kind.SPECIALIST_SUPPORT) and conv.specialist_id and \
            conv.specialist.user_id == user.id:
        return "specialist"
    if conv.is_support and is_support_staff(user):
        return "support"
    return None


def conversations_for(user, scope: str | None = None):
    qs = Conversation.objects.select_related("client", "specialist", "specialist__user")
    if scope == "support":
        if not is_support_staff(user):
            return qs.none()
        return qs.filter(kind__in=[Kind.CLIENT_SUPPORT, Kind.SPECIALIST_SUPPORT])
    cond = Q(client=user, kind__in=[Kind.SPECIALIST, Kind.CLIENT_SUPPORT, Kind.AI])
    if is_specialist(user):
        cond |= Q(specialist__user=user, kind__in=[Kind.SPECIALIST, Kind.SPECIALIST_SUPPORT])
    return qs.filter(cond)


def participant_user_ids(conv: Conversation) -> list:
    ids = []
    if conv.client_id and conv.kind != Kind.SPECIALIST_SUPPORT:
        ids.append(conv.client_id)
    if conv.specialist_id and conv.kind in (Kind.SPECIALIST, Kind.SPECIALIST_SUPPORT):
        ids.append(conv.specialist.user_id)
    return ids


def can_change_retention(role: str | None, conv: Conversation) -> bool:
    # Режим хранения выбирает клиент (в чате специалиста с поддержкой — специалист)
    if conv.kind == Kind.SPECIALIST_SUPPORT:
        return role == "specialist"
    return role == "client"


def can_send_files(role: str | None, conv: Conversation) -> bool:
    return conv.kind != Kind.AI and role in ("specialist", "support")


def sender_role_for(role: str) -> str:
    return {"client": Message.SenderRole.CLIENT, "specialist": Message.SenderRole.SPECIALIST,
            "support": Message.SenderRole.SUPPORT}[role]


# ── Участники ─────────────────────────────────────────────────────────────────

def member(conv: Conversation, user) -> ConversationMember:
    obj, _ = ConversationMember.objects.get_or_create(conversation=conv, user=user)
    return obj


def visible_messages(conv: Conversation, user, m: ConversationMember | None = None):
    now = timezone.now()
    m = m or ConversationMember.objects.filter(conversation=conv, user=user).first()
    qs = conv.messages.filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))
    if m and m.cleared_at:
        qs = qs.filter(created_at__gt=m.cleared_at)
    return qs.exclude(hidden_for__user=user)


def unread_count(conv: Conversation, user, role: str, m: ConversationMember | None = None) -> int:
    m = m or ConversationMember.objects.filter(conversation=conv, user=user).first()
    qs =visible_messages(conv, user, m).filter(deleted_at__isnull=True).exclude(kind=Message.Kind.SYSTEM)
    if role == "support":
        qs = qs.exclude(sender_role=Message.SenderRole.SUPPORT)
        if conv.support_read_at:
            qs = qs.filter(created_at__gt=conv.support_read_at)
    else:
        qs = qs.exclude(sender=user)
        if m and m.last_read_at:
            qs = qs.filter(created_at__gt=m.last_read_at)
    return qs.count()


def peer_read_at(conv: Conversation, role: str):
    """Когда собеседник в последний раз читал разговор — для галочек «прочитано»."""
    if conv.kind == Kind.AI:
        return None
    if role in ("client", "specialist") and conv.is_support:
        return conv.support_read_at
    if role == "support":
        owner = conv.client_id if conv.kind == Kind.CLIENT_SUPPORT else conv.specialist.user_id
    elif role == "client":
        owner = conv.specialist.user_id if conv.specialist_id else None
    else:
        owner = conv.client_id
    if not owner:
        return None
    return ConversationMember.objects.filter(conversation=conv, user_id=owner).values_list(
        "last_read_at", flat=True).first()


def mark_read(conv: Conversation, user, role: str):
    now = timezone.now()
    m = member(conv, user)
    m.last_read_at = now
    m.save(update_fields=["last_read_at"])
    if role == "support":
        conv.support_read_at = now
        conv.save(update_fields=["support_read_at"])
    broadcast(conv, {"type": "read", "conversation": str(conv.id), "role": role, "at": now.isoformat()},
              exclude_user=user.id)
    return now


# ── Сериализация ──────────────────────────────────────────────────────────────

def counterpart(conv: Conversation, role: str) -> dict:
    if conv.kind == Kind.AI:
        return {"type": "ai", "name": AI_NAME, "avatar_config": None}
    if role in ("client", "specialist") and conv.is_support:
        return {"type": "support", "name": SUPPORT_NAME, "avatar_config": None}
    if role == "client":
        from apps.photos.utils import photo_url

        sp = conv.specialist
        # Специалисты работают открыто: клиент видит настоящее фото из профиля
        return {"type": "specialist", "name": sp.display_name, "avatar_config": sp.user.avatar_config,
                "psychologist_id": sp.id, "photo_url": photo_url(sp)}
    if role == "support" and conv.kind == Kind.SPECIALIST_SUPPORT:
        sp = conv.specialist
        return {"type": "specialist", "name": sp.display_name, "avatar_config": sp.user.avatar_config,
                "psychologist_id": sp.id}
    # Специалист или поддержка смотрят на клиента: только псевдоним и аватар
    return {"type": "client", "name": conv.client.alias, "avatar_config": conv.client.avatar_config}


def preview(msg: Message | None) -> dict | None:
    if not msg:
        return None
    if msg.deleted_at:
        text = "Сообщение удалено"
    elif msg.kind == Message.Kind.VOICE:
        text = "Голосовое сообщение"
    elif msg.kind == Message.Kind.FILE:
        text = "Файл"
    elif msg.kind == Message.Kind.SYSTEM:
        code = decrypt_text(msg.text_enc)
        text = system_text(code)
        # Карточки созвонов: клиент форматирует время в своём часовом поясе
        return {"text": text, "created_at": msg.created_at.isoformat(), "sender_role": msg.sender_role,
                "kind": msg.kind, "card": system_card(code)}
    else:
        text = decrypt_text(msg.text_enc)[:120]
    return {"text": text, "created_at": msg.created_at.isoformat(), "sender_role": msg.sender_role,
            "kind": msg.kind}


def serialize_conversation(conv: Conversation, user, role: str | None = None) -> dict:
    role = role or my_role(user, conv)
    m = ConversationMember.objects.filter(conversation=conv, user=user).first()
    last = visible_messages(conv, user, m).order_by("-created_at").first()
    return {
        "id": str(conv.id),
        "kind": conv.kind,
        "my_role": role,
        "counterpart": counterpart(conv, role),
        "retention": conv.retention,
        "retention_changed_at": conv.retention_changed_at.isoformat() if conv.retention_changed_at else None,
        "can_change_retention": can_change_retention(role, conv),
        "screen_protect": conv.screen_protect,
        "can_send_files": can_send_files(role, conv),
        "unread": unread_count(conv, user, role, m),
        "last_message": preview(last),
        "last_message_at": conv.last_message_at.isoformat() if conv.last_message_at else None,
        "peer_read_at": (lambda v: v.isoformat() if v else None)(peer_read_at(conv, role)),
        "created_at": conv.created_at.isoformat(),
    }


SYSTEM_TEXTS = {
    "retention:1h": "Исчезающие сообщения: 1 час. Новые сообщения исчезнут у обоих через час после отправки.",
    "retention:24h": "Исчезающие сообщения: 1 день. Новые сообщения исчезнут у обоих через сутки после отправки.",
    "retention:forever": "Исчезающие сообщения выключены. Новые сообщения хранятся, пока их не удалят участники.",
    "screen:on": "Включена защита от скриншотов: переписка скрывается, когда окно не активно, копирование отключено.",
    "screen:off": "Защита от скриншотов выключена.",
    "support:hello": "Здравствуйте! Это поддержка aprosop. Опишите, что случилось, — ответим как можно скорее.",
}


def system_text(code: str) -> str:
    if code and code.startswith("call:"):
        from apps.dialogs.cards import card_text  # карточки созвонов диалога

        return card_text(code)
    return SYSTEM_TEXTS.get(code, "")


def system_card(code: str) -> dict | None:
    if code and code.startswith("call:"):
        from apps.dialogs.cards import card_for

        return card_for(code)
    return None


def serialize_message(msg: Message, viewer_id=None) -> dict:
    """viewer_id=None — «нейтральная» форма для рассылки; mine вычисляет консьюмер."""
    deleted = msg.deleted_at is not None
    att = None
    if not deleted and msg.kind in (Message.Kind.VOICE, Message.Kind.FILE):
        a = getattr(msg, "attachment", None)
        if a is not None:
            att = {
                "name": decrypt_text(a.name_enc) or ("voice" if msg.kind == Message.Kind.VOICE else "file"),
                "mime": a.mime,
                "size": a.size,
                "duration_ms": a.duration_ms,
                "peaks": a.peaks or [],
            }
    raw = "" if deleted else decrypt_text(msg.text_enc)
    data = {
        "id": str(msg.id),
        "conversation": str(msg.conversation_id),
        "kind": msg.kind,
        "sender_role": msg.sender_role,
        "text": system_text(raw) if msg.kind == Message.Kind.SYSTEM else raw,
        "system_code": raw if msg.kind == Message.Kind.SYSTEM else None,
        "card": system_card(raw) if msg.kind == Message.Kind.SYSTEM else None,
        "attachment": att,
        "created_at": msg.created_at.isoformat(),
        "edited_at": msg.edited_at.isoformat() if msg.edited_at else None,
        "deleted": deleted,
        "expires_at": msg.expires_at.isoformat() if msg.expires_at else None,
    }
    if viewer_id is not None:
        data["mine"] = msg.sender_id is not None and str(msg.sender_id) == str(viewer_id)
    return data


# ── Создание сообщений ────────────────────────────────────────────────────────

RETENTION_TTL = {
    Conversation.Retention.HOUR: timedelta(hours=1),
    Conversation.Retention.DAY: timedelta(hours=24),
}


def expiry_for(conv: Conversation):
    """Исчезающие сообщения: срок считается от отправки и действует только для новых сообщений."""
    ttl = RETENTION_TTL.get(conv.retention)
    return timezone.now() + ttl if ttl else None


def create_message(conv: Conversation, *, sender, sender_role: str, kind: str = Message.Kind.TEXT,
                   text: str = "") -> Message:
    msg = Message.objects.create(
        conversation=conv, sender=sender, sender_role=sender_role, kind=kind,
        text_enc=encrypt_text(text), expires_at=expiry_for(conv),
    )
    Conversation.objects.filter(pk=conv.pk).update(last_message_at=msg.created_at)
    conv.last_message_at = msg.created_at
    return msg


def add_system_message(conv: Conversation, code: str) -> Message:
    return create_message(conv, sender=None, sender_role=Message.SenderRole.SYSTEM,
                          kind=Message.Kind.SYSTEM, text=code)


def hide_for(msg: Message, user):
    HiddenMessage.objects.get_or_create(message=msg, user=user)


# ── Realtime ──────────────────────────────────────────────────────────────────

def _send(group: str, event: dict):
    layer = get_channel_layer()
    if layer is None:
        return
    try:
        async_to_sync(layer.group_send)(group, {"type": "chat.event", "event": event})
    except Exception:  # noqa: BLE001 — realtime не должен ломать REST
        # Содержимое не логируем — только тип события
        logger.warning("chat: failed to deliver %s event", event.get("type"))


def broadcast(conv: Conversation, event: dict, *, exclude_user=None, sender_id=None):
    """Рассылает событие всем участникам разговора (и дежурной поддержке)."""
    payload = dict(event)
    if sender_id is not None:
        payload["_sender"] = str(sender_id)
    for uid in participant_user_ids(conv):
        if exclude_user is not None and str(uid) == str(exclude_user):
            continue
        _send(user_group(uid), payload)
    if conv.is_support:
        if exclude_user is not None:
            payload["_exclude"] = str(exclude_user)
        _send(SUPPORT_GROUP, payload)


def send_to_user(user_id, event: dict):
    _send(user_group(user_id), event)


def broadcast_message(conv: Conversation, msg: Message, event_type: str = "message.new"):
    broadcast(conv, {"type": event_type, "message": serialize_message(msg)}, sender_id=msg.sender_id or "")
