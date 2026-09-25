"""
Session Models — Изоляция участников
--------------------------------------
Сессия связывает клиента и психолога через одноразовый UUID-токен.
Психолог видит только: номер сессии, свой гонорар, время.
Клиент видит только: псевдоним психолога, время, статус оплаты.
Ни одна из сторон не видит персональных данных другой.
"""
import secrets
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


def _generate_session_token() -> str:
    """Криптографически стойкий одноразовый токен сессии (32 байта = 64 hex символа)."""
    return secrets.token_hex(32)


class ConsultationSession(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Создана"
        AWAITING_PAYMENT = "awaiting_payment", "Ожидает оплаты"
        PAID = "paid", "Оплачена"
        IN_PROGRESS = "in_progress", "Идёт сессия"
        COMPLETED = "completed", "Завершена"
        CANCELLED = "cancelled", "Отменена"
        REFUNDED = "refunded", "Возврат"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Связи — UUID без персональных данных в JOIN-запросах
    client = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="client_sessions",
        limit_choices_to={"role": "client"},
    )
    psychologist_profile = models.ForeignKey(
        "users.PsychologistProfile",
        on_delete=models.PROTECT,
        related_name="psychologist_sessions",
    )

    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT
    )
    scheduled_at = models.DateTimeField()
    duration_minutes = models.PositiveSmallIntegerField(default=50)

    # Одноразовый токен — привязан к конкретному платежу,
    # после завершения сессии инвалидируется
    session_token = models.CharField(
        max_length=64, unique=True, default=_generate_session_token, db_index=True
    )
    token_expires_at = models.DateTimeField(null=True, blank=True)
    token_used = models.BooleanField(default=False)

    # WebRTC: комната (изолированный UUID-канал без привязки к пользователям)
    webrtc_room_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)

    # Финансы (в копейках, чтобы избежать float-ошибок)
    amount_kopecks = models.PositiveIntegerField()
    psychologist_payout_kopecks = models.PositiveIntegerField(default=0)
    platform_fee_kopecks = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "sessions_consultation"
        verbose_name = "Сессия консультации"
        indexes = [
            models.Index(fields=["status", "scheduled_at"]),
            models.Index(fields=["webrtc_room_id"]),
        ]
        constraints = [
            # Защита от гонки: два клиента не могут занять одно и то же начало у специалиста.
            # Пересечения с другим началом отсекает блокировка профиля при записи.
            models.UniqueConstraint(
                fields=["psychologist_profile", "scheduled_at"],
                condition=~models.Q(status__in=["cancelled", "refunded"]),
                name="consultation_unique_active_start",
            ),
        ]

    def __str__(self):
        return f"Session {self.id} [{self.status}] @ {self.scheduled_at:%Y-%m-%d %H:%M}"

    def is_token_valid(self) -> bool:
        if self.token_used:
            return False
        if self.token_expires_at and timezone.now() > self.token_expires_at:
            return False
        return True

    def mark_token_used(self) -> None:
        self.token_used = True
        self.save(update_fields=["token_used", "updated_at"])

    def compute_split(self, platform_fee_percent: float = 20.0) -> None:
        """Рассчитывает сплит платежа: гонорар психолога и комиссия платформы."""
        fee = int(self.amount_kopecks * platform_fee_percent / 100)
        self.platform_fee_kopecks = fee
        self.psychologist_payout_kopecks = self.amount_kopecks - fee

    def save(self, *args, **kwargs):
        if not self.token_expires_at:
            # Токен действует 24 часа с момента создания
            self.token_expires_at = timezone.now() + timezone.timedelta(hours=24)
        super().save(*args, **kwargs)


class SessionNote(models.Model):
    """Заметки психолога после сессии. Хранятся изолированно, без ссылки на клиента."""

    session = models.OneToOneField(
        ConsultationSession, on_delete=models.CASCADE, related_name="note"
    )
    # Зашифрованный текст (AES-256) — расшифровка только психологом
    encrypted_content = models.BinaryField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "sessions_note"


class SessionEvent(models.Model):
    """Лог событий сессии для аудита (без содержимого переговоров)."""

    class EventType(models.TextChoices):
        TOKEN_CREATED = "token_created", "Токен создан"
        PAYMENT_INITIATED = "payment_initiated", "Платёж инициирован"
        PAYMENT_CONFIRMED = "payment_confirmed", "Платёж подтверждён"
        ROOM_OPENED = "room_opened", "Комната открыта"
        PARTICIPANT_JOINED = "participant_joined", "Участник подключился"
        PARTICIPANT_LEFT = "participant_left", "Участник отключился"
        SESSION_ENDED = "session_ended", "Сессия завершена"
        PAYOUT_SENT = "payout_sent", "Выплата отправлена"

    session = models.ForeignKey(
        ConsultationSession, on_delete=models.CASCADE, related_name="events"
    )
    event_type = models.CharField(max_length=30, choices=EventType.choices)
    # Метаданные без персональных данных: {"participant_role": "client"}
    metadata = models.JSONField(default=dict)
    occurred_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "sessions_event"
        ordering = ["occurred_at"]
