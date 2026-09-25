"""Эндпоинты ИИ-помощника «Тиша»: статус, согласие, ответ со стримингом (SSE)."""
import json
import logging

from asgiref.sync import sync_to_async
from django.db import transaction
from django.db.models import F
from django.http import StreamingHttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from . import ai, conf, services
from .crypto import decrypt_text
from .models import AIDailyUsage, Conversation, Message
from .views import MAX_TEXT, ChatSendThrottle

logger = logging.getLogger(__name__)
Kind = Conversation.Kind


def _require_client(user):
    if user.role != "client":
        raise PermissionDenied("Тиша доступна клиентам.")


def _used_today(user) -> int:
    return AIDailyUsage.objects.filter(user=user, day=timezone.localdate()).values_list("count", flat=True).first() or 0


def _status(user) -> dict:
    conv = Conversation.objects.filter(kind=Kind.AI, client=user).first()
    used = _used_today(user)
    limit = conf.ai_daily_limit()
    return {
        "name": services.AI_NAME,
        "enabled": conf.ai_enabled(),
        "consent": bool(conv and conv.ai_consent_at),
        "conversation_id": str(conv.id) if conv else None,
        "daily_limit": limit,
        "used_today": used,
        "remaining_today": max(0, limit - used),
    }


class AIStatusView(APIView):
    def get(self, request):
        _require_client(request.user)
        return Response(_status(request.user))


class AIConsentView(APIView):
    """POST — согласиться (создаёт разговор с приветствием); DELETE — отозвать согласие."""

    def post(self, request):
        _require_client(request.user)
        with transaction.atomic():
            conv, created = Conversation.objects.select_for_update().get_or_create(
                kind=Kind.AI, client=request.user)
            if not conv.ai_consent_at:
                conv.ai_consent_at = timezone.now()
                conv.save(update_fields=["ai_consent_at"])
            if created:
                services.create_message(conv, sender=None, sender_role=Message.SenderRole.AI, text=ai.GREETING)
        return Response(_status(request.user))

    def delete(self, request):
        _require_client(request.user)
        Conversation.objects.filter(kind=Kind.AI, client=request.user).update(ai_consent_at=None)
        return Response(_status(request.user))


def _sse(payload: dict) -> bytes:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n".encode("utf-8")


class AIReplyView(APIView):
    """POST {"text"} → text/event-stream:
    {"type":"user_message","message":…} → {"type":"delta","text":…}* → {"type":"done","message":…}
    либо {"type":"error","detail":…}.
    """

    throttle_classes = [ChatSendThrottle]

    def post(self, request):
        user = request.user
        _require_client(user)
        if not conf.ai_enabled():
            return Response({"detail": "Тиша скоро появится.", "code": "ai_unavailable"},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)
        conv = Conversation.objects.filter(kind=Kind.AI, client=user).first()
        if conv is None or not conv.ai_consent_at:
            return Response({"detail": "Сначала подтвердите согласие.", "code": "consent_required"},
                            status=status.HTTP_403_FORBIDDEN)
        text = (request.data.get("text") or "").strip()
        if not text:
            raise ValidationError({"text": "Сообщение пустое."})
        if len(text) > MAX_TEXT:
            raise ValidationError({"text": f"Не больше {MAX_TEXT} символов."})

        limit = conf.ai_daily_limit()
        with transaction.atomic():
            usage, _ = AIDailyUsage.objects.select_for_update().get_or_create(user=user, day=timezone.localdate())
            if usage.count >= limit:
                return Response(
                    {"detail": "На сегодня сообщения Тише закончились. Завтра можно продолжить, "
                               "а поговорить с живым специалистом можно в любое время.",
                     "code": "ai_limit"},
                    status=status.HTTP_429_TOO_MANY_REQUESTS,
                )
            AIDailyUsage.objects.filter(pk=usage.pk).update(count=F("count") + 1)
            remaining = max(0, limit - usage.count - 1)

        user_msg = services.create_message(conv, sender=user, sender_role=Message.SenderRole.CLIENT, text=text)
        services.mark_read(conv, user, "client")
        services.broadcast_message(conv, user_msg)

        pairs = [
            (m.sender_role, decrypt_text(m.text_enc))
            for m in services.visible_messages(conv, user)
            .filter(deleted_at__isnull=True, kind=Message.Kind.TEXT)
            .order_by("-created_at")[: ai.HISTORY_LIMIT]
        ][::-1]
        history = ai.build_history(pairs)
        user_payload = services.serialize_message(user_msg, user.id)

        def save_reply(reply_text: str):
            msg = services.create_message(conv, sender=None, sender_role=Message.SenderRole.AI, text=reply_text)
            services.mark_read(conv, user, "client")
            services.broadcast_message(conv, msg)
            return services.serialize_message(msg, user.id)

        def refund():
            AIDailyUsage.objects.filter(pk=usage.pk, count__gt=0).update(count=F("count") - 1)

        async def events():
            yield _sse({"type": "user_message", "message": user_payload, "remaining_today": remaining})
            parts: list[str] = []
            try:
                async for chunk in ai.stream_reply(history):
                    parts.append(chunk)
                    yield _sse({"type": "delta", "text": chunk})
                reply = "".join(parts).strip()
                if not reply:
                    raise ai.AIRefusal()
            except ai.AIRefusal:
                reply = ai.REFUSAL_TEXT
                yield _sse({"type": "replace", "text": reply})
            except Exception as exc:  # noqa: BLE001
                # Без содержимого — только тип ошибки
                logger.warning("chat.ai: provider error %s", type(exc).__name__)
                await sync_to_async(refund)()
                yield _sse({"type": "error", "detail": "Тиша сейчас не может ответить. Попробуйте чуть позже."})
                return
            message = await sync_to_async(save_reply)(reply)
            yield _sse({"type": "done", "message": message, "remaining_today": remaining})

        resp = StreamingHttpResponse(events(), content_type="text/event-stream; charset=utf-8")
        resp["Cache-Control"] = "no-cache, no-store"
        resp["X-Accel-Buffering"] = "no"  # nginx: не буферизовать поток
        return resp
