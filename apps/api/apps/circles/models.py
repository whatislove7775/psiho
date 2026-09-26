"""
«Круги» — тематические группы поддержки на 5–8 участников с психологом-ведущим.

Приватность — главное:
- участники видят друг друга ТОЛЬКО под псевдонимом круга («Участник-Лиса»), который
  генерируется заново для каждого круга; alias аккаунта и id пользователя наружу
  не отдаются никому (ни участникам, ни ведущему);
- наружу у участника есть только `handle` — случайная строка, уникальная в пределах
  круга (id пира в групповом звонке, автор сообщения в чате);
- сообщения чата зашифрованы (apps.chat.crypto), исчезающие — удаляются по таймеру.

Деньги — через apps.billing (Hold на балансе клиента): одна заморозка на каждую
оплачиваемую единицу (встречу или весь цикл) — см. services.py.
"""
import secrets
from datetime import timedelta
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


def new_handle() -> str:
    return secrets.token_urlsafe(9)


class Circle(models.Model):
    class Topic(models.TextChoices):
        ANXIETY = "anxiety", "Тревога"
        BURNOUT = "burnout", "Выгорание"
        BREAKUP = "breakup", "Расставание"
        GRIEF = "grief", "Горе и утрата"
        PARENTING = "parenting", "Родительство"
        SELF_ESTEEM = "self_esteem", "Самооценка"
        LONELINESS = "loneliness", "Одиночество"
        RELOCATION = "relocation", "Переезд и эмиграция"

    class Format(models.TextChoices):
        SERIES = "series", "Цикл встреч"
        SINGLE = "single", "Одна встреча"

    class Billing(models.TextChoices):
        PER_MEETING = "per_meeting", "За каждую встречу"
        SERIES = "series", "За весь цикл"

    class Status(models.TextChoices):
        DRAFT = "draft", "Черновик"
        PENDING = "pending", "На проверке"
        REJECTED = "rejected", "Нужны правки"
        RECRUITING = "recruiting", "Набор"
        RUNNING = "running", "Идёт"
        FINISHED = "finished", "Завершён"
        CANCELLED = "cancelled", "Отменён"

    PUBLIC = ("recruiting", "running", "finished")
    EDITABLE = ("draft", "rejected")

    class Retention(models.TextChoices):
        FOREVER = "forever", "Хранить всё время круга"
        DAY = "24h", "Исчезают через 1 день"
        HOUR = "1h", "Исчезают через 1 час"

    MIN_CAPACITY = 5
    MAX_CAPACITY = 8

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    host = models.ForeignKey("users.PsychologistProfile", on_delete=models.CASCADE, related_name="circles")
    topic = models.CharField(max_length=20, choices=Topic.choices, db_index=True)
    title = models.CharField(max_length=120)
    description = models.TextField(max_length=3000)
    rules = models.TextField(max_length=2000, blank=True, default="")
    format = models.CharField(max_length=10, choices=Format.choices, default=Format.SERIES)
    meeting_minutes = models.PositiveSmallIntegerField(default=90)
    capacity = models.PositiveSmallIntegerField(default=8)
    billing = models.CharField(max_length=12, choices=Billing.choices, default=Billing.PER_MEETING)
    price_kopecks = models.BigIntegerField()  # за встречу или за весь цикл — см. billing
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRAFT, db_index=True)
    # Ведущий может разрешить участникам включать настоящую камеру (по умолчанию — только аватары)
    allow_real_faces = models.BooleanField(default=False)
    chat_retention = models.CharField(max_length=8, choices=Retention.choices, default=Retention.FOREVER)
    # Проверка персоналом перед публикацией
    submitted_at = models.DateTimeField(null=True, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+",
    )
    review_comment = models.TextField(max_length=2000, blank=True, default="")
    cancel_reason = models.CharField(max_length=300, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "circles_circle"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title} [{self.status}]"

    @property
    def is_public(self) -> bool:
        return self.status in self.PUBLIC


class Meeting(models.Model):
    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Запланирована"
        LIVE = "live", "Идёт"
        DONE = "done", "Прошла"
        MISSED = "missed", "Не состоялась"
        CANCELLED = "cancelled", "Отменена"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    circle = models.ForeignKey(Circle, on_delete=models.CASCADE, related_name="meetings")
    index = models.PositiveSmallIntegerField()  # 1…N
    starts_at = models.DateTimeField(db_index=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.SCHEDULED, db_index=True)
    # Комната группового звонка (apps.signaling.group)
    room_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    host_joined_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    settled = models.BooleanField(default=False)

    class Meta:
        db_table = "circles_meeting"
        ordering = ["starts_at"]
        unique_together = ("circle", "index")

    @property
    def ends_at(self):
        return self.starts_at + timedelta(minutes=self.circle.meeting_minutes)


class Membership(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Участник"
        WAITLIST = "waitlist", "Лист ожидания"
        LEFT = "left", "Вышел"
        REMOVED = "removed", "Удалён ведущим"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    circle = models.ForeignKey(Circle, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="circle_memberships")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE, db_index=True)
    # Псевдоним в этом круге и публичный идентификатор (вместо id пользователя)
    pseudonym = models.CharField(max_length=40)
    handle = models.CharField(max_length=16, default=new_handle, unique=True)
    tone = models.CharField(max_length=10, default="lilac")
    chat_muted = models.BooleanField(default=False)
    joined_at = models.DateTimeField(default=timezone.now)
    waitlisted_at = models.DateTimeField(null=True, blank=True)
    left_at = models.DateTimeField(null=True, blank=True)
    # Последняя неудачная попытка перевести из листа ожидания (не хватило денег)
    promote_failed_at = models.DateTimeField(null=True, blank=True)
    chat_read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "circles_membership"
        unique_together = [("circle", "user"), ("circle", "pseudonym")]
        ordering = ["joined_at"]


class Charge(models.Model):
    """Оплата участника: одна заморозка apps.billing на встречу (per_meeting) или на цикл (series).

    `ref` — session_ref заморозки (Hold): по нему billing.services захватывает/возвращает деньги.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    membership = models.ForeignKey(Membership, on_delete=models.CASCADE, related_name="charges")
    meeting = models.ForeignKey(Meeting, null=True, blank=True, on_delete=models.SET_NULL, related_name="charges")
    ref = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    amount_kopecks = models.BigIntegerField()
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "circles_charge"
        ordering = ["created_at"]


class CircleMessage(models.Model):
    """Сообщение группового чата. Автор — участник (по псевдониму), ведущий или система."""

    class Role(models.TextChoices):
        MEMBER = "member", "Участник"
        HOST = "host", "Ведущий"
        SYSTEM = "system", "Система"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    circle = models.ForeignKey(Circle, on_delete=models.CASCADE, related_name="messages")
    author = models.ForeignKey(Membership, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    role = models.CharField(max_length=8, choices=Role.choices)
    text_enc = models.BinaryField(blank=True, default=b"")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    expires_at = models.DateTimeField(null=True, blank=True, db_index=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "circles_message"
        ordering = ["created_at"]
        indexes = [models.Index(fields=["circle", "created_at"])]
