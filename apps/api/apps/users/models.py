"""
Zero-Knowledge User Architecture
---------------------------------
Client:   регистрируется только с паролем. Никаких email, ФИО, телефонов.
          Идентификация — псевдоним `тихий-кит-4821` + ключ восстановления.
Psychologist: верифицированный специалист. ФИО и документы хранятся
              в зашифрованном виде, доступ — только администраторам.
"""
import json
import uuid

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

AVATAR_CONFIG_MAX_BYTES = 8 * 1024


def validate_avatar_config(value):
    if value is None:
        return
    if not isinstance(value, dict):
        raise ValidationError("Конфигурация аватара должна быть объектом.")
    size = len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    if size > AVATAR_CONFIG_MAX_BYTES:
        raise ValidationError("Конфигурация аватара слишком большая (максимум 8 КБ).")


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create(self, *, password, alias=None, email=None, **extra) -> "User":
        from .aliases import generate_unique_alias
        from .security import hash_email

        user = self.model(
            alias=alias or generate_unique_alias(),
            email_hash=hash_email(email) if email else None,
            **extra,
        )
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_anonymous_client(self, password: str) -> "User":
        return self._create(password=password, role=User.Role.CLIENT)

    def create_psychologist(self, email: str, password: str, **extra) -> "User":
        return self._create(password=password, email=email, role=User.Role.PSYCHOLOGIST, **extra)

    def create_user(self, alias=None, password=None, **extra) -> "User":
        extra.setdefault("role", User.Role.CLIENT)
        return self._create(password=password, alias=alias, **extra)

    def create_superuser(self, alias=None, password=None, **extra) -> "User":
        extra.update(role=User.Role.ADMIN, is_staff=True, is_superuser=True)
        return self._create(password=password, alias=alias, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    class Role(models.TextChoices):
        CLIENT = "client", "Клиент"
        PSYCHOLOGIST = "psychologist", "Психолог"
        ADMIN = "admin", "Администратор"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # Хеш email — только у тех, кто его указал (психологи). Клиенты анонимны.
    email_hash = models.CharField(max_length=64, unique=True, null=True, blank=True)
    # Публичный псевдоним и логин: `тихий-кит-4821`
    alias = models.CharField(max_length=40, unique=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.CLIENT)
    avatar_config = models.JSONField(null=True, blank=True, validators=[validate_avatar_config])
    # Хеш ключа восстановления (make_password); сам ключ показывается один раз
    recovery_key_hash = models.CharField(max_length=128, blank=True, default="")

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = "alias"
    REQUIRED_FIELDS = []

    class Meta:
        db_table = "users_user"
        verbose_name = "Пользователь"

    def __str__(self):
        return f"{self.role}:{self.alias}"

    @property
    def has_email(self) -> bool:
        return bool(self.email_hash)

    @property
    def is_platform_admin(self) -> bool:
        return self.role == self.Role.ADMIN or self.is_staff


class PsychologistProfile(models.Model):
    """Профиль психолога. ФИО и документы — зашифрованы на уровне приложения."""

    class VerificationStatus(models.TextChoices):
        PENDING = "pending", "Ожидает проверки"
        APPROVED = "approved", "Верифицирован"
        REJECTED = "rejected", "Отклонён"
        SUSPENDED = "suspended", "Приостановлен"

    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name="psychologist_profile"
    )
    # Зашифрованные поля (AES-256-GCM через django-fernet-fields или ручное шифрование)
    # Хранятся как base64-blob; расшифровка только в памяти при запросе
    encrypted_full_name = models.BinaryField(blank=True, null=True)
    encrypted_diploma_number = models.BinaryField(blank=True, null=True)
    encrypted_phone = models.BinaryField(blank=True, null=True)

    # Публичная информация для карточки специалиста
    display_name = models.CharField(max_length=80)
    bio = models.TextField(max_length=1200, blank=True)
    specializations = models.JSONField(default=list)
    languages = models.JSONField(default=list)
    approach = models.TextField(max_length=2000, blank=True, default="")
    experience_years = models.PositiveSmallIntegerField(default=0)
    session_rate_rub = models.DecimalField(max_digits=8, decimal_places=2)

    class Gender(models.TextChoices):
        UNSPECIFIED = "", "Не указан"
        FEMALE = "female", "Женщина"
        MALE = "male", "Мужчина"

    # Необязательно: клиенты могут искать по полу специалиста (фильтр в поиске)
    # db_default: rows inserted by older code (and historical migration states) get "" too
    gender = models.CharField(max_length=10, choices=Gender.choices, blank=True, default="", db_default="")

    verification_status = models.CharField(
        max_length=20,
        choices=VerificationStatus.choices,
        default=VerificationStatus.PENDING,
    )
    verified_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="verified_psychologists",
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)

    # YooKassa: ID кошелька психолога для сплит-платежей
    yookassa_account_id = models.CharField(max_length=100, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "users_psychologist_profile"
        verbose_name = "Профиль психолога"

    def __str__(self):
        return f"Psychologist:{self.display_name} [{self.verification_status}]"


class PsychologistSchedule(models.Model):
    """Доступные слоты психолога. Без привязки к личным данным клиентов."""

    WEEKDAYS = [(i, d) for i, d in enumerate(
        ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
    )]

    psychologist = models.ForeignKey(
        PsychologistProfile, on_delete=models.CASCADE, related_name="schedule_slots"
    )
    weekday = models.SmallIntegerField(choices=WEEKDAYS)
    start_time = models.TimeField()
    end_time = models.TimeField()
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "users_schedule"
        unique_together = ("psychologist", "weekday", "start_time")
