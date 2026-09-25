"""
Чаты: клиент↔специалист, клиент↔поддержка, специалист↔поддержка, клиент↔ИИ «Тиша».

Приватность:
- текст сообщений, имена файлов и сами файлы хранятся зашифрованными (crypto.py);
- файлы и голосовые лежат в БД (не в /media) и отдаются только через API
  участникам разговора;
- у каждого сообщения есть expires_at: в режиме «24 часа» оно удаляется
  командой purge_chats (сервис scheduler в docker-compose);
- «удалить у всех» оставляет только надгробие (без текста и файла).
"""
import uuid

from django.conf import settings
from django.db import models


class Conversation(models.Model):
    class Kind(models.TextChoices):
        SPECIALIST = "specialist", "Клиент и специалист"
        CLIENT_SUPPORT = "client_support", "Клиент и поддержка"
        SPECIALIST_SUPPORT = "specialist_support", "Специалист и поддержка"
        AI = "ai", "Клиент и ИИ-помощник"

    class Retention(models.TextChoices):
        DAY = "24h", "24 часа"
        FOREVER = "forever", "Бессрочно"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=24, choices=Kind.choices)
    # Клиент (для specialist / client_support / ai)
    client = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE,
        related_name="chat_conversations",
    )
    # Специалист (для specialist / specialist_support)
    specialist = models.ForeignKey(
        "users.PsychologistProfile", null=True, blank=True, on_delete=models.CASCADE,
        related_name="chat_conversations",
    )
    retention = models.CharField(max_length=8, choices=Retention.choices, default=Retention.FOREVER)
    retention_changed_at = models.DateTimeField(null=True, blank=True)
    # Когда поддержка в последний раз прочитала разговор (общая отметка для всех сотрудников)
    support_read_at = models.DateTimeField(null=True, blank=True)
    # Согласие на обработку сообщений ИИ-провайдером (только kind=ai)
    ai_consent_at = models.DateTimeField(null=True, blank=True)
    last_message_at = models.DateTimeField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "chat_conversation"
        constraints = [
            models.UniqueConstraint(
                fields=["client", "specialist"], condition=models.Q(kind="specialist"),
                name="chat_unique_client_specialist",
            ),
            models.UniqueConstraint(
                fields=["client"], condition=models.Q(kind="client_support"),
                name="chat_unique_client_support",
            ),
            models.UniqueConstraint(
                fields=["specialist"], condition=models.Q(kind="specialist_support"),
                name="chat_unique_specialist_support",
            ),
            models.UniqueConstraint(
                fields=["client"], condition=models.Q(kind="ai"), name="chat_unique_client_ai",
            ),
        ]

    def __str__(self):
        return f"Conversation {self.id} [{self.kind}]"

    @property
    def is_support(self) -> bool:
        return self.kind in (self.Kind.CLIENT_SUPPORT, self.Kind.SPECIALIST_SUPPORT)


class ConversationMember(models.Model):
    """Личное состояние участника: прочитано до, очищено до."""

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="members")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="chat_memberships")
    last_read_at = models.DateTimeField(null=True, blank=True)
    cleared_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "chat_member"
        unique_together = ("conversation", "user")


class Message(models.Model):
    class Kind(models.TextChoices):
        TEXT = "text", "Текст"
        VOICE = "voice", "Голосовое"
        FILE = "file", "Файл"
        SYSTEM = "system", "Системное"

    class SenderRole(models.TextChoices):
        CLIENT = "client", "Клиент"
        SPECIALIST = "specialist", "Специалист"
        SUPPORT = "support", "Поддержка"
        AI = "ai", "ИИ-помощник"
        SYSTEM = "system", "Система"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="chat_messages",
    )
    sender_role = models.CharField(max_length=12, choices=SenderRole.choices)
    kind = models.CharField(max_length=8, choices=Kind.choices, default=Kind.TEXT)
    # Зашифрованный текст (Fernet). Для system — код события, тоже зашифрован.
    text_enc = models.BinaryField(blank=True, default=b"")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    edited_at = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    # None — хранится бессрочно; иначе удаляется purge_chats после этого момента
    expires_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        db_table = "chat_message"
        ordering = ["created_at"]
        indexes = [models.Index(fields=["conversation", "created_at"])]


class Attachment(models.Model):
    """Файл или голосовое. Содержимое и имя зашифрованы; хранится в БД, не в /media."""

    message = models.OneToOneField(Message, on_delete=models.CASCADE, related_name="attachment")
    name_enc = models.BinaryField(blank=True, default=b"")
    mime = models.CharField(max_length=100)
    size = models.PositiveIntegerField()
    duration_ms = models.PositiveIntegerField(null=True, blank=True)
    peaks = models.JSONField(default=list, blank=True)
    data_enc = models.BinaryField()

    class Meta:
        db_table = "chat_attachment"


class HiddenMessage(models.Model):
    """«Удалить у себя»."""

    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name="hidden_for")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")

    class Meta:
        db_table = "chat_hidden_message"
        unique_together = ("message", "user")


class AIDailyUsage(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    day = models.DateField()
    count = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "chat_ai_usage"
        unique_together = ("user", "day")
