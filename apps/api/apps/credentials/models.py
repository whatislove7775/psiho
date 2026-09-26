"""
Документы и квалификация специалистов: дипломы, переподготовка, сертификаты методов,
супервизия, членство в ассоциациях, публикации, курсы.

Каждый пункт проверяет сотрудник (право specialists.verify). Подтверждённые пункты видны
всем на странице специалиста; файлы — только те, что специалист отметил «показывать публично».

Файлы хранятся зашифрованными в БД (Fernet, как вложения чата), не в /media: nginx их
не раздаёт, отдаёт только API — владельцу, сотруднику с правом проверки или всем (если
пункт подтверждён и файл публичный). Номер документа тоже зашифрован; публично — маска.
"""
import uuid

from django.conf import settings
from django.db import models


class Credential(models.Model):
    class Kind(models.TextChoices):
        DIPLOMA = "diploma", "Диплом о высшем образовании"
        RETRAINING = "retraining", "Переподготовка, ДПО"
        METHOD = "method", "Сертификат метода"
        SUPERVISION = "supervision", "Супервизия"
        MEMBERSHIP = "membership", "Членство в ассоциации"
        PUBLICATION = "publication", "Публикация"
        COURSE = "course", "Курс или тренинг"
        OTHER = "other", "Другое"

    class Status(models.TextChoices):
        PENDING = "pending", "На проверке"
        APPROVED = "approved", "Подтверждено"
        REJECTED = "rejected", "Отклонено"
        NEEDS_INFO = "needs_info", "Требует уточнения"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    profile = models.ForeignKey(
        "users.PsychologistProfile", on_delete=models.CASCADE, related_name="credentials"
    )
    kind = models.CharField(max_length=20, choices=Kind.choices)
    # Название: специальность / программа / метод / тема супервизии / название статьи
    title = models.CharField(max_length=200)
    # Организация: вуз, центр ДПО, ассоциация, журнал (для публикации)
    issuer = models.CharField(max_length=200, blank=True, default="")
    year = models.PositiveSmallIntegerField(null=True, blank=True)
    # Конец периода (супервизия, членство, долгие программы)
    year_end = models.PositiveSmallIntegerField(null=True, blank=True)
    # Супервизия
    supervisor = models.CharField(max_length=120, blank=True, default="")
    hours = models.PositiveSmallIntegerField(null=True, blank=True)
    # Публикация
    url = models.URLField(max_length=500, blank=True, default="")
    doi = models.CharField(max_length=120, blank=True, default="")
    # Номер документа — зашифрован; публично показывается маска «•••• 1234»
    number_enc = models.BinaryField(blank=True, default=b"")
    number_hint = models.CharField(max_length=8, blank=True, default="")

    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING, db_index=True)
    reject_reason = models.CharField(max_length=500, blank=True, default="")
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    # Когда пункт последний раз ушёл на проверку (очередь сортируется по нему)
    submitted_at = models.DateTimeField(auto_now_add=True)
    # Пункт уже подтверждали раньше, а потом изменили — повторная проверка
    was_approved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "credentials_credential"
        ordering = ["-year", "-created_at"]
        indexes = [models.Index(fields=["status", "submitted_at"])]

    def __str__(self):
        return f"{self.get_kind_display()}: {self.title}"[:120]


class CredentialFile(models.Model):
    """Скан или фото документа (PDF/JPEG/PNG/WebP ≤ 10 МБ). Изображения — без EXIF."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    credential = models.ForeignKey(Credential, on_delete=models.CASCADE, related_name="files")
    name_enc = models.BinaryField(blank=True, default=b"")
    mime = models.CharField(max_length=40)
    size = models.PositiveIntegerField()
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)
    data_enc = models.BinaryField()
    # «Показывать документ публично» (после подтверждения) или «только для проверки»
    is_public = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "credentials_file"
        ordering = ["created_at"]


class CredentialNote(models.Model):
    """Переписка сотрудника и специалиста по одному пункту («требует уточнения»)."""

    class Author(models.TextChoices):
        STAFF = "staff", "Команда"
        SPECIALIST = "specialist", "Специалист"
        SYSTEM = "system", "Система"

    credential = models.ForeignKey(Credential, on_delete=models.CASCADE, related_name="notes")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    author_role = models.CharField(max_length=12, choices=Author.choices)
    text = models.TextField(max_length=2000)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "credentials_note"
        ordering = ["created_at", "id"]
