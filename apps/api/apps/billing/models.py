"""
Анонимный баланс: двойная запись.

Каждая операция — неизменяемая LedgerTransaction с проводками Entry, сумма проводок
которой равна нулю. Баланс счёта = сумма его проводок (кэшируется в Account.balance_kopecks
в той же транзакции БД и сверяется командой billing_sweep --verify).

Знак: положительный баланс пользовательского счёта — деньги, которые платформа
держит для пользователя. Системные счета (провайдер, подарки, корректировки)
«отдают» деньги и уходят в минус — поэтому сумма всех проводок всегда 0.

Про карту и личность плательщика не хранится ничего: только id платежа у провайдера,
сумма и статус. Реквизиты для выплат специалистам — только в зашифрованном виде.
"""
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class ImmutableQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise PermissionError("Проводки нельзя изменять.")

    def delete(self):
        raise PermissionError("Проводки нельзя удалять.")


class Account(models.Model):
    class Kind(models.TextChoices):
        CLIENT = "client", "Баланс клиента"
        CLIENT_HOLD = "client_hold", "Заморожено под созвоны"
        SPEC_PENDING = "spec_pending", "Заработок: ожидает"
        SPEC_AVAILABLE = "spec_available", "Заработок: доступно"
        SPEC_PAYOUT = "spec_payout", "Заработок: в выплате"
        PLATFORM_FEE = "platform_fee", "Комиссия платформы"
        PROVIDER = "provider", "Платёжный провайдер"
        PAYOUTS_SENT = "payouts_sent", "Выплачено специалистам"
        GIFT = "gift", "Подарочные коды"
        ADJUSTMENT = "adjustment", "Корректировки"

    USER_KINDS = frozenset({"client", "client_hold", "spec_pending", "spec_available", "spec_payout"})

    key = models.CharField(max_length=80, unique=True)
    kind = models.CharField(max_length=20, choices=Kind.choices, db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="billing_accounts",
    )
    balance_kopecks = models.BigIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "billing_account"
        verbose_name = "Счёт"

    def __str__(self):
        return f"{self.key} = {self.balance_kopecks}"

    @property
    def is_user_account(self) -> bool:
        return self.kind in self.USER_KINDS


class LedgerTransaction(models.Model):
    class Kind(models.TextChoices):
        TOPUP = "topup", "Пополнение"
        TOPUP_REFUND = "topup_refund", "Возврат пополнения на карту"
        TOPUP_REFUND_REVERSAL = "topup_refund_reversal", "Отмена возврата"
        HOLD = "hold", "Оплата созвона (заморозка)"
        CAPTURE = "capture", "Созвон состоялся"
        RELEASE = "release", "Возврат за созвон"
        CALL_REFUND = "call_refund", "Возврат за состоявшийся созвон"
        MATURE = "mature", "Заработок доступен"
        PAYOUT_REQUEST = "payout_request", "Запрос выплаты"
        PAYOUT_PAID = "payout_paid", "Выплата отправлена"
        PAYOUT_RETURN = "payout_return", "Выплата отклонена"
        GIFT_REDEEM = "gift_redeem", "Подарочный код"
        ADJUSTMENT = "adjustment", "Корректировка"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=30, choices=Kind.choices, db_index=True)
    idempotency_key = models.CharField(max_length=120, unique=True)
    # Без внешнего ключа: запись в журнале переживает удаление созвона/аккаунта
    session_id = models.UUIDField(null=True, blank=True, db_index=True)
    memo = models.CharField(max_length=200, blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+",
    )
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    objects = ImmutableQuerySet.as_manager()

    class Meta:
        db_table = "billing_transaction"
        ordering = ["-created_at"]
        verbose_name = "Операция"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise PermissionError("Операции нельзя изменять.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionError("Операции нельзя удалять.")


class Entry(models.Model):
    transaction = models.ForeignKey(LedgerTransaction, on_delete=models.PROTECT, related_name="entries")
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name="entries")
    amount_kopecks = models.BigIntegerField()
    created_at = models.DateTimeField(default=timezone.now)

    objects = ImmutableQuerySet.as_manager()

    class Meta:
        db_table = "billing_entry"
        indexes = [models.Index(fields=["account", "created_at"])]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise PermissionError("Проводки нельзя изменять.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionError("Проводки нельзя удалять.")


class Hold(models.Model):
    """Оплата одного созвона: заморозка на балансе клиента → списание или возврат."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Заморожено"
        CAPTURED = "captured", "Списано"
        RELEASED = "released", "Возвращено"
        PARTIAL = "partial", "Частичный возврат"
        REFUNDED = "refunded", "Возвращено после созвона"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.OneToOneField(
        "consultations.ConsultationSession", null=True, blank=True, on_delete=models.SET_NULL, related_name="billing_hold",
    )
    session_ref = models.UUIDField(db_index=True)  # копия id созвона — остаётся после удаления
    client = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+",
    )
    specialist = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+",
    )
    # id аккаунтов — счета ищутся по ним и после удаления пользователя
    client_ref = models.CharField(max_length=40, blank=True, default="", db_index=True)
    specialist_ref = models.CharField(max_length=40, blank=True, default="", db_index=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ACTIVE, db_index=True)
    amount_kopecks = models.BigIntegerField()
    # Итог расчёта
    specialist_kopecks = models.BigIntegerField(default=0)
    fee_kopecks = models.BigIntegerField(default=0)
    returned_kopecks = models.BigIntegerField(default=0)
    reason = models.CharField(max_length=40, blank=True, default="")
    duration_minutes = models.PositiveSmallIntegerField(default=0)
    scheduled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    settled_at = models.DateTimeField(null=True, blank=True)
    # Когда заработок станет доступен к выплате (для CAPTURED/PARTIAL)
    available_at = models.DateTimeField(null=True, blank=True, db_index=True)
    matured = models.BooleanField(default=False)

    class Meta:
        db_table = "billing_hold"
        ordering = ["-created_at"]


class TopUp(models.Model):
    """Пополнение через платёжного провайдера. Никаких данных карты и плательщика."""

    class Status(models.TextChoices):
        PENDING = "pending", "Ожидает оплаты"
        SUCCEEDED = "succeeded", "Зачислено"
        CANCELED = "canceled", "Отменено"
        REFUNDED = "refunded", "Возвращено на карту"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+",
    )
    user_ref = models.CharField(max_length=40, blank=True, default="", db_index=True)
    provider = models.CharField(max_length=20, default="mock")
    provider_payment_id = models.CharField(max_length=100, null=True, blank=True, unique=True)
    amount_kopecks = models.BigIntegerField()
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING, db_index=True)
    method = models.CharField(max_length=20, blank=True, default="")
    confirmation_type = models.CharField(max_length=12, blank=True, default="redirect")
    confirmation_url = models.CharField(max_length=500, blank=True, default="")
    confirmation_token = models.CharField(max_length=200, blank=True, default="")
    with_receipt = models.BooleanField(default=False)
    provider_refund_id = models.CharField(max_length=100, blank=True, default="")
    refunded_kopecks = models.BigIntegerField(default=0)
    cancel_reason = models.CharField(max_length=60, blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "billing_topup"
        ordering = ["-created_at"]

    @property
    def is_test(self) -> bool:
        return self.provider == "mock"


class GiftBatch(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    label = models.CharField(max_length=80, blank=True, default="")
    amount_kopecks = models.BigIntegerField()
    count = models.PositiveIntegerField()
    expires_at = models.DateTimeField(null=True, blank=True)
    revoked = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+",
    )
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "billing_gift_batch"
        ordering = ["-created_at"]


class GiftCode(models.Model):
    """Код хранится только в виде HMAC: утечка базы не раскрывает непогашенные коды."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Не погашен"
        REDEEMED = "redeemed", "Погашен"
        REVOKED = "revoked", "Отозван"

    batch = models.ForeignKey(GiftBatch, on_delete=models.PROTECT, related_name="codes")
    code_hash = models.CharField(max_length=64, unique=True)
    hint = models.CharField(max_length=8, blank=True, default="")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE, db_index=True)
    redeemed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+",
    )
    redeemed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "billing_gift_code"


class PayoutMethod(models.Model):
    """Реквизиты специалиста для выплат — только зашифрованные (Fernet) + маска для показа."""

    class Kind(models.TextChoices):
        SBP = "sbp", "СБП по номеру телефона"
        BANK_ACCOUNT = "bank_account", "Банковский счёт"
        CARD_TOKEN = "card_token", "Карта (токен ЮKassa)"

    class TaxStatus(models.TextChoices):
        SELF_EMPLOYED = "self_employed", "Самозанятый (НПД)"
        IP = "ip", "Индивидуальный предприниматель"

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="payout_method")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    tax_status = models.CharField(max_length=20, choices=TaxStatus.choices, default=TaxStatus.SELF_EMPLOYED)
    encrypted = models.BinaryField()
    masked = models.CharField(max_length=80, blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "billing_payout_method"


class PayoutRequest(models.Model):
    class Status(models.TextChoices):
        REQUESTED = "requested", "Запрошена"
        PROCESSING = "processing", "Отправляется"
        PAID = "paid", "Выплачена"
        REJECTED = "rejected", "Отклонена"
        FAILED = "failed", "Не прошла"

    OPEN = ("requested", "processing")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    specialist = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+",
    )
    specialist_ref = models.CharField(max_length=40, blank=True, default="", db_index=True)
    amount_kopecks = models.BigIntegerField()
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.REQUESTED, db_index=True)
    rail = models.CharField(max_length=20, default="manual")
    destination_kind = models.CharField(max_length=20, blank=True, default="")
    destination_masked = models.CharField(max_length=80, blank=True, default="")
    provider_payout_id = models.CharField(max_length=100, null=True, blank=True, unique=True)
    note = models.CharField(max_length=300, blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+",
    )
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "billing_payout_request"
        ordering = ["-created_at"]


class WebhookEvent(models.Model):
    """Журнал входящих уведомлений провайдера (для идемпотентности и сверки). Без тела запроса."""

    provider = models.CharField(max_length=20)
    event = models.CharField(max_length=40)
    object_id = models.CharField(max_length=100, db_index=True)
    result = models.CharField(max_length=40, blank=True, default="")
    ip = models.GenericIPAddressField(null=True, blank=True)
    received_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "billing_webhook_event"
        ordering = ["-received_at"]
