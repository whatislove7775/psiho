"""REST API чатов (/api/v1/chat/). Содержимое сообщений никогда не логируется."""
import uuid
from urllib.parse import quote

from django.core import signing
from django.db import IntegrityError, transaction
from django.http import Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from apps.sessions.models import ConsultationSession
from apps.users.models import PsychologistProfile, User

from . import conf, services
from .crypto import decrypt_bytes, decrypt_text, encrypt_bytes, encrypt_text
from .models import Attachment, Conversation, Message
from .uploads import validate_file, validate_voice

Kind = Conversation.Kind
MAX_TEXT = 4000
PAGE = 40

WS_TOKEN_SALT = "aprosop-chat-ws"
WS_TOKEN_MAX_AGE = 60 * 60


class ChatSendThrottle(UserRateThrottle):
    scope = "chat_send"

    def __init__(self):
        self.rate = conf.send_rate()
        super().__init__()


def _booking_statuses():
    S = ConsultationSession.Status
    return [S.AWAITING_PAYMENT, S.PAID, S.IN_PROGRESS, S.COMPLETED, S.CANCELLED, S.REFUNDED]


def has_booking(client, profile) -> bool:
    return ConsultationSession.objects.filter(
        client=client, psychologist_profile=profile, status__in=_booking_statuses()
    ).exists()


def get_conversation(request, pk) -> tuple[Conversation, str]:
    conv = Conversation.objects.select_related("client", "specialist", "specialist__user").filter(pk=pk).first()
    if conv is None:
        raise Http404
    role = services.my_role(request.user, conv)
    if role is None:
        # Не раскрываем, существует ли разговор
        raise Http404
    return conv, role


def get_message(request, pk) -> tuple[Message, Conversation, str]:
    msg = Message.objects.select_related("conversation").filter(pk=pk).first()
    if msg is None:
        raise Http404
    conv, role = get_conversation(request, msg.conversation_id)
    if not services.visible_messages(conv, request.user).filter(pk=msg.pk).exists():
        raise Http404
    return msg, conv, role


class WsTokenView(APIView):
    """Подписанный токен для /ws/chat/?token=… (1 час)."""

    def post(self, request):
        token = signing.dumps({"user_id": str(request.user.id)}, salt=WS_TOKEN_SALT, compress=True)
        return Response({"token": token, "expires_in": WS_TOKEN_MAX_AGE})


def validate_chat_ws_token(token: str | None) -> str | None:
    if not token:
        return None
    try:
        data = signing.loads(token, salt=WS_TOKEN_SALT, max_age=WS_TOKEN_MAX_AGE)
    except (signing.BadSignature, signing.SignatureExpired, ValueError, TypeError):
        return None
    if not isinstance(data, dict) or not data.get("user_id"):
        return None
    return str(data["user_id"])


class ConversationListView(APIView):
    def get(self, request):
        scope = request.query_params.get("scope")
        if scope == "support" and not services.is_support_staff(request.user):
            raise PermissionDenied("Раздел доступен только поддержке.")
        convs = services.conversations_for(request.user, scope).order_by("-last_message_at", "-created_at")
        role_override = "support" if scope == "support" else None
        data = [services.serialize_conversation(c, request.user, role_override) for c in convs[:200]]
        return Response(data)

    def post(self, request):
        user = request.user
        target = request.data.get("with")
        try:
            with transaction.atomic():
                conv, created = self._get_or_create(user, target, request.data)
        except IntegrityError:
            # Гонка двух одновременных запросов — берём существующий
            conv, created = self._get_or_create(user, target, request.data)
        return Response(services.serialize_conversation(conv, user),
                        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    def _get_or_create(self, user, target, data):
        if target == "support":
            if services.is_specialist(user):
                conv, created = Conversation.objects.get_or_create(
                    kind=Kind.SPECIALIST_SUPPORT, specialist=user.psychologist_profile)
            elif user.role == "client":
                conv, created = Conversation.objects.get_or_create(kind=Kind.CLIENT_SUPPORT, client=user)
            else:
                raise PermissionDenied("Сотрудники отвечают из раздела «Поддержка».")
            if created:
                services.add_system_message(conv, "support:hello")
                # Приветствие — не новое обращение для поддержки
                conv.support_read_at = timezone.now()
                conv.save(update_fields=["support_read_at"])
            return conv, created
        if target == "specialist":
            if user.role != "client":
                raise PermissionDenied("Писать специалисту может только клиент.")
            profile = PsychologistProfile.objects.filter(
                pk=data.get("psychologist_id"),
                verification_status=PsychologistProfile.VerificationStatus.APPROVED,
            ).first()
            if profile is None:
                raise ValidationError({"psychologist_id": "Специалист не найден."})
            exists = Conversation.objects.filter(kind=Kind.SPECIALIST, client=user, specialist=profile).exists()
            if not exists and not has_booking(user, profile):
                if not conf.allow_without_booking():
                    raise PermissionDenied("Написать специалисту можно после записи на созвон.")
                from apps.dialogs.policy import check_new_dialogue

                check_new_dialogue(user)
            return Conversation.objects.get_or_create(kind=Kind.SPECIALIST, client=user, specialist=profile)
        if target == "client":
            if not services.is_specialist(user):
                raise PermissionDenied("Писать клиенту может только специалист.")
            client = User.objects.filter(alias=data.get("client_alias"), role=User.Role.CLIENT).first()
            if client is None or not has_booking(client, user.psychologist_profile):
                raise ValidationError({"client_alias": "Можно написать только своему клиенту."})
            return Conversation.objects.get_or_create(
                kind=Kind.SPECIALIST, client=client, specialist=user.psychologist_profile)
        raise ValidationError({"with": "Укажите: support, specialist или client."})


class ContactsView(APIView):
    """С кем можно начать чат (клиент — специалисты, специалист — клиенты)."""

    def get(self, request):
        user = request.user
        if user.role == "client":
            if conf.allow_without_booking():
                profiles = PsychologistProfile.objects.filter(
                    verification_status=PsychologistProfile.VerificationStatus.APPROVED)
            else:
                ids = ConsultationSession.objects.filter(
                    client=user, status__in=_booking_statuses()).values_list("psychologist_profile_id", flat=True)
                profiles = PsychologistProfile.objects.filter(pk__in=set(ids))
            return Response([
                {"type": "specialist", "psychologist_id": p.id, "name": p.display_name,
                 "avatar_config": p.user.avatar_config}
                for p in profiles.select_related("user").order_by("display_name")
            ])
        if services.is_specialist(user):
            ids = ConsultationSession.objects.filter(
                psychologist_profile=user.psychologist_profile, status__in=_booking_statuses()
            ).values_list("client_id", flat=True)
            clients = User.objects.filter(pk__in=set(ids)).order_by("alias")
            return Response([
                {"type": "client", "client_alias": c.alias, "name": c.alias, "avatar_config": c.avatar_config}
                for c in clients
            ])
        return Response([])


class UnreadView(APIView):
    def get(self, request):
        user = request.user
        total = 0
        for conv in services.conversations_for(user):
            total += services.unread_count(conv, user, services.my_role(user, conv))
        support = 0
        if services.is_support_staff(user):
            for conv in services.conversations_for(user, "support"):
                support += services.unread_count(conv, user, "support")
        return Response({"total": total, "support": support})


class ConversationDetailView(APIView):
    def get(self, request, pk):
        conv, role = get_conversation(request, pk)
        return Response(services.serialize_conversation(conv, request.user, role))

    def patch(self, request, pk):
        conv, role = get_conversation(request, pk)
        retention = request.data.get("retention")
        if retention not in Conversation.Retention.values:
            raise ValidationError({"retention": "Выберите 24h или forever."})
        if not services.can_change_retention(role, conv):
            raise PermissionDenied("Режим хранения выбирает клиент.")
        if retention != conv.retention:
            conv.retention = retention
            conv.retention_changed_at = timezone.now()
            conv.save(update_fields=["retention", "retention_changed_at"])
            msg = services.add_system_message(conv, f"retention:{retention}")
            services.broadcast_message(conv, msg)
            services.broadcast(conv, {"type": "conversation.updated", "conversation": str(conv.id),
                                      "retention": conv.retention})
        return Response(services.serialize_conversation(conv, request.user, role))


class ClearView(APIView):
    """Очистить историю у себя. У собеседника всё остаётся."""

    def post(self, request, pk):
        conv, role = get_conversation(request, pk)
        m = services.member(conv, request.user)
        m.cleared_at = timezone.now()
        m.save(update_fields=["cleared_at"])
        services.send_to_user(request.user.id, {"type": "conversation.cleared", "conversation": str(conv.id)})
        return Response(services.serialize_conversation(conv, request.user, role))


class ReadView(APIView):
    def post(self, request, pk):
        conv, role = get_conversation(request, pk)
        at = services.mark_read(conv, request.user, role)
        return Response({"read_at": at.isoformat()})


class MessageListView(APIView):
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_throttles(self):
        return [ChatSendThrottle()] if self.request.method == "POST" else []

    def get(self, request, pk):
        conv, role = get_conversation(request, pk)
        qs = services.visible_messages(conv, request.user).select_related("attachment")
        before = request.query_params.get("before")
        if before:
            anchor = Message.objects.filter(pk=before, conversation=conv).first() if _is_uuid(before) else None
            if anchor is None:
                raise ValidationError({"before": "Неизвестное сообщение."})
            qs = qs.filter(created_at__lt=anchor.created_at)
        try:
            limit = max(1, min(100, int(request.query_params.get("limit", PAGE))))
        except ValueError:
            limit = PAGE
        page = list(qs.order_by("-created_at")[: limit + 1])
        has_more = len(page) > limit
        page = page[:limit][::-1]
        return Response({
            "results": [services.serialize_message(m, request.user.id) for m in page],
            "has_more": has_more,
        })

    def post(self, request, pk):
        conv, role = get_conversation(request, pk)
        if conv.kind == Kind.AI:
            raise ValidationError({"detail": "Сообщения Тише отправляются через /chat/ai/reply/."})
        kind = request.data.get("kind") or Message.Kind.TEXT
        user = request.user
        sender_role = services.sender_role_for(role)
        # Антиспам диалогов: до ответа специалиста или записи — несколько сообщений
        from apps.dialogs.policy import check_send

        check_send(conv, role)

        if kind == Message.Kind.TEXT:
            text = (request.data.get("text") or "").strip()
            if not text:
                raise ValidationError({"text": "Сообщение пустое."})
            if len(text) > MAX_TEXT:
                raise ValidationError({"text": f"Не больше {MAX_TEXT} символов."})
            msg = services.create_message(conv, sender=user, sender_role=sender_role, text=text)
        elif kind in (Message.Kind.VOICE, Message.Kind.FILE):
            upload = request.FILES.get("file")
            if upload is None:
                raise ValidationError({"file": "Прикрепите файл."})
            if kind == Message.Kind.FILE:
                if not services.can_send_files(role, conv):
                    raise PermissionDenied("Файлы могут отправлять только специалисты и поддержка.")
                data, mime, name = validate_file(upload)
                duration, peaks = None, []
            else:
                data, mime, duration, peaks = validate_voice(
                    upload, request.data.get("duration_ms"), request.data.get("peaks"))
                name = "voice"
            with transaction.atomic():
                msg = services.create_message(conv, sender=user, sender_role=sender_role, kind=kind)
                Attachment.objects.create(
                    message=msg, name_enc=encrypt_text(name), mime=mime, size=len(data),
                    duration_ms=duration, peaks=peaks, data_enc=encrypt_bytes(data),
                )
        else:
            raise ValidationError({"kind": "Неизвестный тип сообщения."})

        msg = Message.objects.select_related("attachment").get(pk=msg.pk)
        services.mark_read(conv, user, role)
        services.broadcast_message(conv, msg)
        return Response(services.serialize_message(msg, user.id), status=status.HTTP_201_CREATED)


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(str(value))
        return True
    except ValueError:
        return False


class MessageDetailView(APIView):
    def patch(self, request, pk):
        msg, conv, role = get_message(request, pk)
        if msg.sender_id != request.user.id:
            raise PermissionDenied("Можно изменять только свои сообщения.")
        if msg.deleted_at or msg.kind != Message.Kind.TEXT:
            raise ValidationError({"detail": "Это сообщение нельзя изменить."})
        text = (request.data.get("text") or "").strip()
        if not text:
            raise ValidationError({"text": "Сообщение пустое."})
        if len(text) > MAX_TEXT:
            raise ValidationError({"text": f"Не больше {MAX_TEXT} символов."})
        msg.text_enc = encrypt_text(text)
        msg.edited_at = timezone.now()
        msg.save(update_fields=["text_enc", "edited_at"])
        services.broadcast_message(conv, msg, "message.updated")
        return Response(services.serialize_message(msg, request.user.id))


class MessageDeleteView(APIView):
    """{"for": "me"} — скрыть у себя; {"for": "all"} — удалить у всех (только своё)."""

    def post(self, request, pk):
        msg, conv, role = get_message(request, pk)
        scope = request.data.get("for", "me")
        if scope == "me":
            services.hide_for(msg, request.user)
            services.send_to_user(request.user.id, {"type": "message.hidden", "conversation": str(conv.id),
                                                    "id": str(msg.id)})
            return Response(status=status.HTTP_204_NO_CONTENT)
        if scope != "all":
            raise ValidationError({"for": "Укажите me или all."})
        if msg.sender_id != request.user.id:
            raise PermissionDenied("Удалить у всех можно только своё сообщение.")
        if not msg.deleted_at:
            with transaction.atomic():
                Attachment.objects.filter(message=msg).delete()
                msg.text_enc = b""
                msg.deleted_at = timezone.now()
                msg.save(update_fields=["text_enc", "deleted_at"])
            services.broadcast_message(conv, msg, "message.updated")
        return Response(services.serialize_message(msg, request.user.id))


class AttachmentView(APIView):
    """Расшифровывает и отдаёт файл/голосовое только участнику разговора."""

    def get(self, request, pk):
        msg, conv, role = get_message(request, pk)
        if msg.deleted_at:
            raise Http404
        att = get_object_or_404(Attachment, message=msg)
        data = decrypt_bytes(att.data_enc)
        name = decrypt_text(att.name_enc) or "file"
        inline = att.mime.startswith(("audio/", "image/"))
        resp = HttpResponse(data, content_type=att.mime)
        resp["Content-Disposition"] = (
            f"{'inline' if inline else 'attachment'}; filename*=UTF-8''{quote(name)}"
        )
        resp["Cache-Control"] = "private, no-store"
        resp["X-Content-Type-Options"] = "nosniff"
        resp["Content-Security-Policy"] = "default-src 'none'; sandbox"
        return resp
