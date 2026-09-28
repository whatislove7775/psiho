"""
Zero-Knowledge User Architecture
---------------------------------
Client:   регистрируется только с паролем. Никаких email, ФИО, телефонов.
          Идентификация — псевдоним `тихий-кит-4821` + ключ восстановления.
Psychologist: верифицированный специалист. ФИО и документы хранятся
              в зашифрованном виде, доступ — только администраторам.
"""
import json
import re
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
    if value.get("version") == 3:
        _validate_avatar_v3(value)
    elif value.get("version") == 4:
        _validate_avatar_v4(value)


_AVATAR_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")
# v4 options may come from another group of characters: "<group>.<id>"
_AVATAR_OPT = re.compile(r"^([a-z]{2,12}\.)?[a-z0-9][a-z0-9-]{0,39}$")
_AVATAR_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
AVATAR_V3_SLOTS = ("hair", "beard", "eyewear", "headwear", "earrings")
AVATAR_V3_COLORS = ("hairColor", "eyeColor", "skin")


def _validate_avatar_v3(value):
    """v3 = HEADZ character + parts (see apps/web/src/lib/avatar/schema.ts). Option ids are
    checked for shape only — the catalogue lives in the web app and old ids degrade gracefully."""
    if not isinstance(value.get("base"), str) or not _AVATAR_ID.match(value["base"]):
        raise ValidationError("Аватар: неизвестный персонаж.")
    for k in AVATAR_V3_SLOTS:
        v = value.get(k, "none")
        if not isinstance(v, str) or not (v == "none" or _AVATAR_ID.match(v)):
            raise ValidationError(f"Аватар: некорректное значение «{k}».")
    for k in AVATAR_V3_COLORS:
        v = value.get(k)
        if v is not None and (not isinstance(v, str) or not _AVATAR_HEX.match(v)):
            raise ValidationError(f"Аватар: цвет «{k}» должен быть в формате #RRGGBB.")


AVATAR_V4_SLOTS = AVATAR_V3_SLOTS + ("mask",)
AVATAR_V4_COLORS = AVATAR_V3_COLORS + ("hairTip", "beardColor")
AVATAR_V4_FACE = (
    "headWidth", "faceLength", "jaw", "chin", "cheeks", "noseSize", "noseWidth", "noseLength",
    "eyeSize", "eyeSpacing", "browHeight", "lips", "mouthWidth", "ears",
)
# group → {key: ("num", lo, hi) | ("hex",) | ("enum", {...}) | ("list", {...})}
AVATAR_V4_GROUPS = {
    "skinFx": {"blush": ("num", 0, 1), "freckles": ("num", 0, 1), "moles": ("num", 0, 3), "age": ("num", 0, 1)},
    "eyes": {"style": ("enum", {"natural", "ring", "cartoon", "bright"}), "lashes": ("num", -1, 1)},
    "brows": {
        "style": ("enum", {"natural", "straight", "arched", "angled", "soft", "raised"}),
        "thickness": ("num", -1, 1),
        "color": ("hex",),
    },
    "makeup": {
        "lip": ("hex",), "lipAmount": ("num", 0, 1), "shadow": ("hex",), "shadowAmount": ("num", 0, 1),
        "liner": ("num", 0, 1),
    },
    "acc": {"frame": ("hex",), "lens": ("hex",), "hat": ("hex",), "piercings": ("list", {"nose", "brow", "lip", "septum"})},
}


def _is_num(v, lo, hi):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and lo <= v <= hi


def _validate_avatar_v4(value):
    """v4 = v3 + mask slot, cross-group options, face-shape sliders and style groups
    (see apps/web/src/lib/avatar/schema.ts). Unknown keys are rejected so the JSON stays small and typed."""
    err = ValidationError("Аватар: некорректные настройки.")
    if not isinstance(value.get("base"), str) or not _AVATAR_ID.match(value["base"]):
        raise ValidationError("Аватар: неизвестный персонаж.")
    for k in AVATAR_V4_SLOTS:
        v = value.get(k, "none")
        if not isinstance(v, str) or not (v == "none" or _AVATAR_OPT.match(v)):
            raise ValidationError(f"Аватар: некорректное значение «{k}».")
    for k in AVATAR_V4_COLORS:
        v = value.get(k)
        if v is not None and (not isinstance(v, str) or not _AVATAR_HEX.match(v)):
            raise ValidationError(f"Аватар: цвет «{k}» должен быть в формате #RRGGBB.")
    if value.get("hairTipStyle", "tips") not in ("tips", "streaks"):
        raise err
    face = value.get("face", {})
    if not isinstance(face, dict) or any(k not in AVATAR_V4_FACE or not _is_num(v, -1, 1) for k, v in face.items()):
        raise ValidationError("Аватар: некорректная форма лица.")
    for group, spec in AVATAR_V4_GROUPS.items():
        g = value.get(group, {})
        if not isinstance(g, dict):
            raise err
        for k, v in g.items():
            rule = spec.get(k)
            if rule is None:
                raise err
            kind = rule[0]
            ok = (
                (kind == "num" and _is_num(v, rule[1], rule[2]))
                or (kind == "hex" and (v is None or (isinstance(v, str) and _AVATAR_HEX.match(v))))
                or (kind == "enum" and v in rule[1])
                or (kind == "list" and isinstance(v, list) and len(v) <= len(rule[1]) and all(x in rule[1] for x in v))
            )
            if not ok:
                raise err
    known = {"version", "base", "hairTipStyle", "face", *AVATAR_V4_SLOTS, *AVATAR_V4_COLORS, *AVATAR_V4_GROUPS}
    if any(k not in known for k in value):
        raise err


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

    def create_anonymous_client(self, password: str, alias: str | None = None) -> "User":
        return self._create(password=password, alias=alias, role=User.Role.CLIENT)

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
        # HR-администратор компании (apps.business): видит только агрегаты своей компании
        BUSINESS = "business", "HR компании"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # Хеш email — только у тех, кто его указал (психологи). Клиенты анонимны.
    email_hash = models.CharField(max_length=64, unique=True, null=True, blank=True)
    # Публичный псевдоним и логин: `тихий-кит-4821`
    alias = models.CharField(max_length=40, unique=True)
    # Когда клиент последний раз менял ник сам (ограничение: раз в сутки). Прежние ники не храним.
    alias_changed_at = models.DateTimeField(null=True, blank=True)
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
    # Необязательно: год рождения — на карточках показываем только возраст («32 года»), если указан
    birth_year = models.PositiveSmallIntegerField(null=True, blank=True)

    @property
    def age(self) -> int | None:
        """Возраст по году рождения (точность ±1 год — дата рождения не хранится)."""
        from django.utils import timezone

        return timezone.now().year - self.birth_year if self.birth_year else None

    @property
    def on_service_since(self):
        """С какого момента специалист на сервисе: дата одобрения анкеты, иначе дата регистрации."""
        return self.verified_at or self.created_at

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
