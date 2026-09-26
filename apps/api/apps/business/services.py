"""Операции B2B: компании, HR-админы, программы, коды, активация, счета и бюджет."""
from __future__ import annotations

import secrets
from datetime import date

from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

from apps.billing.crypto import decrypt_json, encrypt_json
from apps.billing.ledger import InsufficientFunds, post, system_account
from apps.billing.models import Account, LedgerTransaction

from .core import code_hash, enrollment_ref, format_code, month_start, new_code_core, normalize_code, today
from .funding import budget_account
from .models import CodeBatch, Company, CompanyAdmin, EmployeeCode, Enrollment, Invoice, Program

K = Account.Kind
T = LedgerTransaction.Kind

MAX_BATCH = 2000
MAX_BUDGET_OP_KOPECKS = 50_000_000 * 100


class BusinessError(Exception):
    """Понятная ошибка по-русски."""


# ── Компании и HR ─────────────────────────────────────────────────

def one_time_password() -> str:
    alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"
    raw = "".join(secrets.choice(alphabet) for _ in range(16))
    return "-".join(raw[i:i + 4] for i in range(0, 16, 4))


def invite_admin(company: Company, *, login: str, full_name: str = "", by=None) -> tuple[CompanyAdmin, str]:
    from apps.users.models import User

    password = one_time_password()
    with transaction.atomic():
        user = User.objects.create_user(alias=login, password=password, role=User.Role.BUSINESS)
        admin = CompanyAdmin.objects.create(user=user, company=company, full_name=full_name[:120], created_by=by)
    return admin, password


def reset_admin_password(admin: CompanyAdmin) -> str:
    from apps.users.services import blacklist_user_tokens

    password = one_time_password()
    admin.user.set_password(password)
    admin.user.save(update_fields=["password"])
    admin.must_change_password = True
    admin.save(update_fields=["must_change_password"])
    blacklist_user_tokens(admin.user)
    return password


# ── Программы ─────────────────────────────────────────────────────

def clean_program(data: dict, *, partial: bool = False, current: Program | None = None) -> dict:
    out: dict = {}
    if "name" in data:
        name = str(data.get("name") or "").strip()[:120]
        if not name:
            raise BusinessError("Назовите программу.")
        out["name"] = name
    if "amount_rub" in data:
        raw = data.get("amount_rub")
        if raw in (None, "", 0, "0"):
            out["amount_kopecks"] = None
        else:
            try:
                rub = int(str(raw).replace(" ", "").replace(" ", ""))
            except ValueError as exc:
                raise BusinessError("Сумма на сотрудника — целое число рублей.") from exc
            if not (500 <= rub <= 1_000_000):
                raise BusinessError("Сумма на сотрудника — от 500 до 1 000 000 ₽ за период.")
            out["amount_kopecks"] = rub * 100
    if "calls_limit" in data:
        raw = data.get("calls_limit")
        if raw in (None, "", 0, "0"):
            out["calls_limit"] = None
        else:
            try:
                n = int(raw)
            except (TypeError, ValueError) as exc:
                raise BusinessError("Количество созвонов — целое число.") from exc
            if not (1 <= n <= 100):
                raise BusinessError("Созвонов за период — от 1 до 100.")
            out["calls_limit"] = n
    if "period" in data:
        if data["period"] not in Program.Period.values:
            raise BusinessError("Период: месяц, квартал или год.")
        out["period"] = data["period"]
    if "services" in data:
        services = [s for s in Program.SERVICES if s in (data.get("services") or [])]
        if not services:
            raise BusinessError("Выберите хотя бы одну услугу.")
        out["services"] = services
    for field in ("starts_on", "expires_on"):
        if field in data:
            raw = data.get(field)
            if raw in (None, ""):
                out[field] = None
            else:
                try:
                    out[field] = date.fromisoformat(str(raw)[:10])
                except ValueError as exc:
                    raise BusinessError("Дата — в формате ГГГГ-ММ-ДД.") from exc
    if "is_active" in data:
        out["is_active"] = bool(data["is_active"])
    merged = {
        "amount_kopecks": getattr(current, "amount_kopecks", None), "calls_limit": getattr(current, "calls_limit", None),
        "starts_on": getattr(current, "starts_on", None), "expires_on": getattr(current, "expires_on", None),
    }
    merged.update({k: v for k, v in out.items() if k in merged})
    if (not partial or "amount_rub" in data or "calls_limit" in data) and merged["amount_kopecks"] is None \
            and merged["calls_limit"] is None:
        raise BusinessError("Задайте лимит: сумму на сотрудника, количество созвонов или и то, и другое.")
    if merged["starts_on"] and merged["expires_on"] and merged["expires_on"] < merged["starts_on"]:
        raise BusinessError("Программа не может закончиться раньше, чем начнётся.")
    if not partial:
        out.setdefault("services", ["calls"])
        out.setdefault("period", Program.Period.MONTH)
    return out


def create_program(company: Company, data: dict) -> Program:
    fields = clean_program(data)
    return Program.objects.create(company=company, **fields)


def update_program(program: Program, data: dict) -> Program:
    fields = clean_program(data, partial=True, current=program)
    for k, v in fields.items():
        setattr(program, k, v)
    program.save()
    return program


def current_program(company: Company) -> Program | None:
    return company.programs.filter(is_active=True).order_by("-created_at").first() or company.programs.order_by("-created_at").first()


# ── Коды сотрудников ──────────────────────────────────────────────

def generate_codes(company: Company, program: Program, *, count: int, label: str = "", by=None) -> tuple[CodeBatch, list[str]]:
    if program.company_id != company.pk:
        raise BusinessError("Программа не найдена.")
    try:
        count = int(count)
    except (TypeError, ValueError) as exc:
        raise BusinessError("Укажите количество кодов.") from exc
    if not (1 <= count <= MAX_BATCH):
        raise BusinessError(f"За раз — от 1 до {MAX_BATCH} кодов.")
    if company.status != Company.Status.ACTIVE:
        raise BusinessError("Компания приостановлена — новые коды выпустить нельзя.")
    codes: list[str] = []
    with transaction.atomic():
        batch = CodeBatch.objects.create(company=company, program=program, label=label.strip()[:80], count=count, created_by=by)
        objs, seen = [], set()
        while len(objs) < count:
            core = new_code_core()
            h = code_hash(core)
            if h in seen:
                continue
            seen.add(h)
            code = format_code(core)
            codes.append(code)
            objs.append(EmployeeCode(batch=batch, code_hash=h, encrypted=encrypt_json({"c": code})))
        EmployeeCode.objects.bulk_create(objs)
    return batch, codes


def batch_codes(batch: CodeBatch) -> list[str]:
    """Повторная выгрузка: все коды партии (в перемешанном порядке и без статусов)."""
    codes = [decrypt_json(bytes(c)).get("c", "") for c in batch.codes.values_list("encrypted", flat=True)]
    codes = [c for c in codes if c]
    secrets.SystemRandom().shuffle(codes)
    return codes


def revoke_batch(batch: CodeBatch) -> None:
    """Отозвать неиспользованные коды партии. Количество не возвращается — иначе по нему видно, сколько активировали."""
    with transaction.atomic():
        batch.revoked = True
        batch.save(update_fields=["revoked"])
        EmployeeCode.objects.filter(batch=batch, status=EmployeeCode.Status.ACTIVE).update(status=EmployeeCode.Status.REVOKED)


def revoke_code(company: Company, raw: str) -> None:
    """Код больше не действует: не использован — отзываем; использован — участие в программе заканчивается.

    Ответ одинаковый в обоих случаях, так что HR не узнаёт, активировал ли сотрудник код.
    """
    core = normalize_code(raw)
    if len(core) != 12:
        raise BusinessError("Проверьте код: BIZ-XXXX-XXXX-XXXX.")
    with transaction.atomic():
        code = EmployeeCode.objects.select_for_update().filter(code_hash=code_hash(core), batch__company=company).first()
        if code is None:
            raise BusinessError("Такого кода у вашей компании нет.")
        code.status = EmployeeCode.Status.REVOKED
        code.save(update_fields=["status"])
        Enrollment.objects.filter(code_ref=enrollment_ref(core), company=company).update(status=Enrollment.Status.ENDED)


REDEEM_FAIL_LIMIT = 10


def redeem(user, raw: str) -> Enrollment:
    fails_key = f"business:redeem-fails:{user.pk}"
    if (cache.get(fails_key) or 0) >= REDEEM_FAIL_LIMIT:
        raise BusinessError("Слишком много неверных попыток. Попробуйте через час.")

    def fail(msg: str):
        try:
            cache.incr(fails_key)
        except ValueError:
            cache.set(fails_key, 1, 3600)
        raise BusinessError(msg)

    core = normalize_code(raw)
    code = EmployeeCode.objects.filter(code_hash=code_hash(core)).first() if len(core) == 12 else None
    if code is None:
        fail("Такого кода нет. Проверьте, нет ли опечатки.")
    with transaction.atomic():
        code = EmployeeCode.objects.select_for_update().select_related("batch__company", "batch__program").get(pk=code.pk)
        batch = code.batch
        if code.status == EmployeeCode.Status.USED:
            raise BusinessError("Этот код уже использован.")
        if code.status == EmployeeCode.Status.REVOKED or batch.revoked:
            raise BusinessError("Этот код больше не действует. Обратитесь к тому, кто его выдал.")
        if batch.company.status != Company.Status.ACTIVE:
            raise BusinessError("Программа компании сейчас приостановлена.")
        program = batch.program
        if not program.is_active or (program.expires_on and program.expires_on < today()):
            raise BusinessError("Срок программы закончился.")
        if Enrollment.objects.filter(user=user, company=batch.company, status=Enrollment.Status.ACTIVE).exists():
            raise BusinessError("Вы уже подключены к программе этой компании — второй код не нужен.")
        code.status = EmployeeCode.Status.USED
        code.save(update_fields=["status"])
        return Enrollment.objects.create(
            user=user, company=batch.company, program=program, code_ref=enrollment_ref(core), joined_month=month_start(),
        )


def leave(user, enrollment_id) -> None:
    """Сотрудник сам отключается от программы (например, сменил работу)."""
    Enrollment.objects.filter(user=user, pk=enrollment_id).update(status=Enrollment.Status.ENDED)


# ── Бюджет и счета ────────────────────────────────────────────────

def _next_invoice_number() -> str:
    year = timezone.now().year
    n = Invoice.objects.filter(number__startswith=f"B2B-{year}-").count() + 1
    while Invoice.objects.filter(number=f"B2B-{year}-{n:04d}").exists():
        n += 1
    return f"B2B-{year}-{n:04d}"


def issue_invoice(company: Company, amount_kopecks: int, *, requested_by_company: bool = False, note: str = "") -> Invoice:
    amount = int(amount_kopecks)
    if not (10_000 * 100 <= amount <= MAX_BUDGET_OP_KOPECKS):
        raise BusinessError("Сумма счёта — от 10 000 ₽.")
    if requested_by_company and Invoice.objects.filter(company=company, status=Invoice.Status.ISSUED,
                                                       requested_by_company=True).count() >= 5:
        raise BusinessError("У вас уже есть неоплаченные счета — оплатите или попросите менеджера их отменить.")
    return Invoice.objects.create(company=company, number=_next_invoice_number(), amount_kopecks=amount,
                                  requested_by_company=requested_by_company, note=note[:300])


def mark_invoice_paid(invoice: Invoice, *, by=None) -> Invoice:
    """Деньги пришли по безналу → бюджет компании в журнале apps.billing."""
    with transaction.atomic():
        invoice = Invoice.objects.select_for_update().get(pk=invoice.pk)
        if invoice.status != Invoice.Status.ISSUED:
            raise BusinessError("Этот счёт уже закрыт.")
        post(T.COMPANY_TOPUP, f"company_topup:{invoice.pk}", [
            (system_account(K.PROVIDER, "bank_transfer"), -invoice.amount_kopecks),
            (budget_account(invoice.company_id), invoice.amount_kopecks),
        ], memo=f"Оплата счёта {invoice.number}", metadata={"company": str(invoice.company_id)}, by=by)
        invoice.status = Invoice.Status.PAID
        invoice.paid_at = timezone.now()
        invoice.decided_by = by
        invoice.save(update_fields=["status", "paid_at", "decided_by"])
    return invoice


def cancel_invoice(invoice: Invoice, *, by=None) -> Invoice:
    if invoice.status != Invoice.Status.ISSUED:
        raise BusinessError("Этот счёт уже закрыт.")
    invoice.status = Invoice.Status.CANCELED
    invoice.decided_by = by
    invoice.save(update_fields=["status", "decided_by"])
    return invoice


def adjust_budget(company: Company, amount_kopecks: int, *, reason: str, key: str, by=None):
    """Ручная корректировка бюджета (возврат остатка компании, исправление ошибки)."""
    amount = int(amount_kopecks)
    if amount == 0 or abs(amount) > MAX_BUDGET_OP_KOPECKS:
        raise BusinessError("Укажите сумму корректировки.")
    if not reason.strip():
        raise BusinessError("Укажите причину.")
    try:
        txn, _ = post(T.COMPANY_ADJUSTMENT, f"company_adj:{key}", [
            (system_account(K.ADJUSTMENT), -amount), (budget_account(company), amount),
        ], memo=reason.strip()[:200], metadata={"company": str(company.pk)}, by=by)
    except InsufficientFunds as exc:
        raise BusinessError("В бюджете меньше этой суммы.") from exc
    return txn
