"""
Персонал, журнал действий, ограничения аккаунтов и жалобы.

Приватность: ни одна модель здесь не хранит содержимое переписки, email или
реальные данные клиентов. Жалоба на сообщение хранит только его идентификатор.
"""
from django.conf import settings
from django.db import models
from django.utils import timezone

from .roles import ROLE_CHOICES


class StaffMember(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="staff_member"
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    is_active = models.BooleanField(default=True)
    # Сотрудник вошёл по одноразовому паролю и обязан сменить его
    must_change_password = models.BooleanField(default=False)
    # TOTP: секрет зашифрован (Fernet, ключ из SECRET_KEY)
    totp_secret_encrypted = models.TextField(blank=True, default="")
    totp_pending_encrypted = models.TextField(blank=True, default="")
    totp_enabled = models.BooleanField(default=False)
    totp_last_step = models.BigIntegerField(default=0)
    note = models.CharField(max_length=200, blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "staff_member"
        verbose_name = "Сотрудник"

    def __str__(self):
        return f"{self.role}:{self.user_id}"


class AuditLogQuerySet(models.QuerySet):
    def update(self, **kwargs):  # журнал только дополняется
        raise PermissionError("Журнал действий нельзя изменять.")

    def delete(self):
        raise PermissionError("Журнал действий нельзя удалять.")


class AuditLog(models.Model):
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="+",
    )
    # Снимок на момент действия — запись остаётся читаемой после удаления аккаунта
    actor_alias = models.CharField(max_length=40, blank=True, default="")
    actor_role = models.CharField(max_length=20, blank=True, default="")
    action = models.CharField(max_length=60, db_index=True)
    target_type = models.CharField(max_length=30, blank=True, default="")
    target_id = models.CharField(max_length=64, blank=True, default="", db_index=True)
    target_label = models.CharField(max_length=120, blank=True, default="")
    details = models.JSONField(default=dict, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=200, blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    objects = AuditLogQuerySet.as_manager()

    class Meta:
        db_table = "staff_audit_log"
        ordering = ["-created_at", "-id"]
        verbose_name = "Запись журнала"

    def save(self, *args, **kwargs):
        if self.pk is not None:
            raise PermissionError("Журнал действий нельзя изменять.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionError("Журнал действий нельзя удалять.")


class AccountStatus(models.Model):
    """Модерационное состояние аккаунта: блокировка и принудительный выход."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="account_status"
    )
    blocked = models.BooleanField(default=False)
    block_reason = models.CharField(max_length=500, blank=True, default="")
    blocked_at = models.DateTimeField(null=True, blank=True)
    blocked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="+",
    )
    # Все JWT, выпущенные раньше этого момента, недействительны
    tokens_valid_after = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "staff_account_status"


class Report(models.Model):
    class TargetType(models.TextChoices):
        USER = "user", "Пользователь"
        SPECIALIST = "specialist", "Специалист"
        SESSION = "session", "Сессия"
        MESSAGE = "message", "Сообщение"

    class Reason(models.TextChoices):
        ABUSE = "abuse", "Оскорбления или угрозы"
        HARASSMENT = "harassment", "Преследование"
        SPAM = "spam", "Спам или реклама"
        FRAUD = "fraud", "Мошенничество"
        UNPROFESSIONAL = "unprofessional", "Непрофессиональное поведение"
        INAPPROPRIATE = "inappropriate", "Недопустимый контент"
        SAFETY = "safety", "Угроза жизни или безопасности"
        OTHER = "other", "Другое"

    class Status(models.TextChoices):
        OPEN = "open", "Новая"
        IN_REVIEW = "in_review", "В работе"
        RESOLVED = "resolved", "Решена"
        DISMISSED = "dismissed", "Отклонена"

    class Action(models.TextChoices):
        NONE = "none", "Без мер"
        WARN = "warn", "Предупреждение"
        BLOCK_USER = "block_user", "Блокировка аккаунта"
        SUSPEND_SPECIALIST = "suspend_specialist", "Приостановка специалиста"
        CANCEL_SESSION = "cancel_session", "Отмена сессии"

    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="reports_sent"
    )
    target_type = models.CharField(max_length=20, choices=TargetType.choices)
    target_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="reports_received",
    )
    target_session = models.ForeignKey(
        "consultations.ConsultationSession", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="+",
    )
    # Идентификатор сообщения чата — без текста
    target_message_id = models.CharField(max_length=64, blank=True, default="")
    reason = models.CharField(max_length=20, choices=Reason.choices)
    comment = models.TextField(max_length=1000, blank=True, default="")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN, db_index=True)
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    resolution_action = models.CharField(max_length=30, choices=Action.choices, blank=True, default="")
    resolution_note = models.TextField(max_length=1000, blank=True, default="")
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "staff_report"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status", "created_at"])]
