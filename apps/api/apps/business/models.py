"""
Программы для компаний (B2B): компания предоплачивает бюджет, сотрудники получают
анонимные созвоны, работодатель видит только агрегаты.

Приватность — главное свойство продукта:
- EmployeeCode не знает, кто его погасил (нет redeemed_by / redeemed_at);
- Enrollment (участие аккаунта в программе) знает аккаунт, но не код: связь с кодом —
  только через HMAC (code_ref), который вычисляется из текста кода серверным ключом;
- время участия и расходов хранится с точностью до месяца (joined_month, period_month);
- в API компании попадают только агрегаты с порогом k-анонимности (stats.py).
Деньги — в журнале apps.billing: бюджет компании = счёт вида company_budget.
"""
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class Company(models.Model):
    class Plan(models.TextChoices):
        PILOT = "pilot", "Пилот"
        STANDARD = "standard", "Стандарт"
        ENTERPRISE = "enterprise", "Корпоративный"

    class Status(models.TextChoices):
        ACTIVE = "active", "Работает"
        PAUSED = "paused", "Приостановлена"
        CLOSED = "closed", "Договор закрыт"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=160)
    legal_name = models.CharField(max_length=200, blank=True, default="")
    inn = models.CharField(max_length=12, blank=True, default="")  # заглушка: реквизиты по договору
    contact_name = models.CharField(max_length=120, blank=True, default="")
    contact_email = models.CharField(max_length=254, blank=True, default="")
    contact_phone = models.CharField(max_length=32, blank=True, default="")
    plan = models.CharField(max_length=20, choices=Plan.choices, default=Plan.PILOT)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ACTIVE, db_index=True)
    contract_number = models.CharField(max_length=40, blank=True, default="")
    note = models.CharField(max_length=500, blank=True, default="")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "business_company"
        ordering = ["name"]
        verbose_name = "Компания"

    def __str__(self):
        return self.name

    @property
    def budget_account_name(self) -> str:
        return str(self.id)


class CompanyAdmin(models.Model):
    """HR-администратор компании: отдельный вход, видит только свою компанию и только агрегаты."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="company_admin")
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="admins")
    full_name = models.CharField(max_length=120, blank=True, default="")
    is_active = models.BooleanField(default=True)
    must_change_password = models.BooleanField(default=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "business_company_admin"
        verbose_name = "HR-администратор"


class Program(models.Model):
    """Что компания оплачивает каждому сотруднику за период."""

    class Period(models.TextChoices):
        MONTH = "month", "Месяц"
        QUARTER = "quarter", "Квартал"
        YEAR = "year", "Год"

    SERVICES = ("calls", "circles", "ai")
    SERVICE_LABELS = {"calls": "Созвоны со специалистом", "circles": "Групповые «Круги»", "ai": "ИИ-помощник"}

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="programs")
    name = models.CharField(max_length=120, default="Забота о сотрудниках")
    # Лимиты на сотрудника за период; null — без лимита этого вида (но не больше бюджета компании)
    amount_kopecks = models.BigIntegerField(null=True, blank=True)
    calls_limit = models.PositiveSmallIntegerField(null=True, blank=True)
    period = models.CharField(max_length=10, choices=Period.choices, default=Period.MONTH)
    services = models.JSONField(default=list)  # ["calls", "circles", "ai"]
    starts_on = models.DateField(null=True, blank=True)
    expires_on = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "business_program"
        ordering = ["-created_at"]


class CodeBatch(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="batches")
    program = models.ForeignKey(Program, on_delete=models.PROTECT, related_name="batches")
    label = models.CharField(max_length=80, blank=True, default="")
    count = models.PositiveIntegerField()
    revoked = models.BooleanField(default=False)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "business_code_batch"
        ordering = ["-created_at"]


class EmployeeCode(models.Model):
    """Одноразовый код сотрудника. НЕ хранит, кто и когда его погасил."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Не использован"
        USED = "used", "Использован"
        REVOKED = "revoked", "Отозван"

    batch = models.ForeignKey(CodeBatch, on_delete=models.CASCADE, related_name="codes")
    code_hash = models.CharField(max_length=64, unique=True)
    # Код зашифрован (Fernet) — чтобы HR мог выгрузить партию ещё раз. Без статуса по каждому коду.
    encrypted = models.BinaryField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE, db_index=True)

    class Meta:
        db_table = "business_employee_code"


class Enrollment(models.Model):
    """Анонимный аккаунт участвует в программе компании. Компания этих строк не видит никогда."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Действует"
        ENDED = "ended", "Завершено"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="company_enrollments")
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="enrollments")
    program = models.ForeignKey(Program, on_delete=models.PROTECT, related_name="enrollments")
    # HMAC(текст кода) другим ключом, чем code_hash: позволяет отозвать доступ по коду,
    # но по самой базе нельзя сопоставить строку EmployeeCode и участника.
    code_ref = models.CharField(max_length=64, unique=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE, db_index=True)
    joined_month = models.DateField()  # только месяц — первое число

    class Meta:
        db_table = "business_enrollment"


class Charge(models.Model):
    """Сколько программа компании заплатила за одну услугу. Время — только месяц."""

    class Status(models.TextChoices):
        RESERVED = "reserved", "Заморожено"
        SETTLED = "settled", "Списано"
        RETURNED = "returned", "Возвращено"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.PROTECT, related_name="charges")
    program = models.ForeignKey(Program, on_delete=models.PROTECT, related_name="charges")
    enrollment = models.ForeignKey(Enrollment, on_delete=models.PROTECT, related_name="charges")
    service = models.CharField(max_length=10, default="calls")
    ref = models.UUIDField(unique=True)  # id созвона (apps.billing.Hold.session_ref)
    covered_kopecks = models.BigIntegerField()
    returned_kopecks = models.BigIntegerField(default=0)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.RESERVED, db_index=True)
    period_month = models.DateField(db_index=True)
    topic = models.CharField(max_length=20, blank=True, default="other")
    minutes = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = "business_charge"

    @property
    def net_kopecks(self) -> int:
        return self.covered_kopecks - self.returned_kopecks


class Invoice(models.Model):
    """Счёт на пополнение бюджета (оплата по безналу; сотрудник отмечает оплату вручную)."""

    class Status(models.TextChoices):
        ISSUED = "issued", "Выставлен"
        PAID = "paid", "Оплачен"
        CANCELED = "canceled", "Отменён"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="invoices")
    number = models.CharField(max_length=30, unique=True)
    amount_kopecks = models.BigIntegerField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ISSUED, db_index=True)
    requested_by_company = models.BooleanField(default=False)
    note = models.CharField(max_length=300, blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now)
    paid_at = models.DateTimeField(null=True, blank=True)
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        db_table = "business_invoice"
        ordering = ["-created_at"]


class Lead(models.Model):
    """Заявка с лендинга «Для компаний» → входящие сотрудников."""

    class Status(models.TextChoices):
        NEW = "new", "Новая"
        IN_PROGRESS = "in_progress", "В работе"
        DONE = "done", "Закрыта"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company_name = models.CharField(max_length=160)
    contact_name = models.CharField(max_length=120, blank=True, default="")
    contact = models.CharField(max_length=160)  # email или телефон контактного лица компании
    employees = models.PositiveIntegerField(null=True, blank=True)
    message = models.TextField(max_length=2000, blank=True, default="")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.NEW, db_index=True)
    company = models.ForeignKey(Company, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "business_lead"
        ordering = ["-created_at"]
