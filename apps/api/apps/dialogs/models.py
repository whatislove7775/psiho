"""
Диалоги: единое пространство пары «клиент — специалист».

Диалог — это разговор apps.chat (Conversation kind=specialist) плюс созвоны
(apps.sessions ConsultationSession) этой пары. Здесь — только тонкий слой поверх:
предложения времени от специалиста и личные заметки специалиста о клиенте.
"""
import uuid

from django.db import models


class CallProposal(models.Model):
    """Специалист предлагает время созвона прямо в диалоге; клиент принимает — созвон назначается."""

    class Status(models.TextChoices):
        PENDING = "pending", "Ждёт ответа"
        ACCEPTED = "accepted", "Принято"
        DECLINED = "declined", "Отклонено"
        WITHDRAWN = "withdrawn", "Отозвано"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey("chat.Conversation", on_delete=models.CASCADE, related_name="call_proposals")
    scheduled_at = models.DateTimeField()
    duration_minutes = models.PositiveSmallIntegerField()
    price_rub = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    # Созвон, созданный при принятии
    session = models.ForeignKey(
        "consultations.ConsultationSession", null=True, blank=True, on_delete=models.SET_NULL, related_name="+",
    )
    # Системное сообщение-карточка в ленте диалога
    message = models.ForeignKey("chat.Message", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "dialogs_call_proposal"
        ordering = ["-created_at"]


class SpecialistNote(models.Model):
    """Личные заметки специалиста о клиенте. Видит только сам специалист; текст зашифрован."""

    specialist = models.ForeignKey("users.PsychologistProfile", on_delete=models.CASCADE, related_name="+")
    client = models.ForeignKey("users.User", on_delete=models.CASCADE, related_name="+")
    text_enc = models.BinaryField(blank=True, default=b"")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "dialogs_specialist_note"
        unique_together = ("specialist", "client")
