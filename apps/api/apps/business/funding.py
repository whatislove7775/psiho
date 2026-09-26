"""
Кто платит первым: программа компании → личный баланс.

Вызывается из apps.billing.services (не форк журнала — только проводка с ещё одной «ногой»):
    reserve_call(session, amount) -> (счёт бюджета компании | None, покрыто копеек)
    reserve(user, amount, ref=..., service="circles", when=date) — то же для других услуг
    company_share(ref) -> (счёт | None, сколько денег компании ещё в этой оплате)
    settled(ref, returned_kopecks, refund=False) — отметить возврат в бюджет компании
    preview_call(user, amount) -> сколько покроет программа (для экрана оплаты)
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from django.db.models import Sum

from apps.billing.ledger import system_account
from apps.billing.models import Account

from .core import month_start, period_bounds, today, topic_for
from .models import Charge, Company, Enrollment, Program

K = Account.Kind


def budget_account(company) -> Account:
    return system_account(K.COMPANY_BUDGET, str(getattr(company, "pk", company)))


def budget_balance(company) -> int:
    acc = Account.objects.filter(key=f"{K.COMPANY_BUDGET}:{getattr(company, 'pk', company)}").only("balance_kopecks").first()
    return acc.balance_kopecks if acc else 0


def program_open(program: Program, on: date, service: str = "calls") -> bool:
    if not program.is_active or service not in (program.services or []):
        return False
    if program.starts_on and on < program.starts_on:
        return False
    if program.expires_on and on > program.expires_on:
        return False
    return True


@dataclass
class Allowance:
    enrollment: Enrollment
    rub_left: int | None  # None — без лимита в рублях
    calls_left: int | None  # None — без лимита по количеству
    period_end: date  # первый день следующего периода

    @property
    def exhausted(self) -> bool:
        return self.rub_left == 0 or self.calls_left == 0


def active_enrollments(user):
    if user is None or not getattr(user, "pk", None):
        return Enrollment.objects.none()
    return (
        Enrollment.objects.filter(user=user, status=Enrollment.Status.ACTIVE, company__status=Company.Status.ACTIVE)
        .select_related("program", "company").order_by("id")
    )


def allowance_of(enrollment: Enrollment, on: date | None = None) -> Allowance:
    on = on or today()
    program = enrollment.program
    start, end = period_bounds(program.period, on)
    used = Charge.objects.filter(
        enrollment=enrollment, period_month__gte=start, period_month__lt=end,
    ).exclude(status=Charge.Status.RETURNED)
    agg = used.aggregate(c=Sum("covered_kopecks"), r=Sum("returned_kopecks"))
    spent = (agg["c"] or 0) - (agg["r"] or 0)
    calls = used.count()
    rub_left = None if program.amount_kopecks is None else max(0, program.amount_kopecks - spent)
    calls_left = None if program.calls_limit is None else max(0, program.calls_limit - calls)
    return Allowance(enrollment, rub_left, calls_left, end)


def _coverage(al: Allowance, amount: int, budget: int) -> int:
    if al.exhausted or amount <= 0:
        return 0
    covered = amount if al.rub_left is None else min(amount, al.rub_left)
    return max(0, min(covered, budget))


def reserve(user, amount: int, *, ref, service: str = "calls", when: date | None = None, topic: str = "other",
            minutes: int = 0):
    """Внутри транзакции оплаты: записать Charge и вернуть (счёт компании, покрыто)."""
    amount = int(amount)
    if amount <= 0 or Charge.objects.filter(ref=ref).exists():
        return None, 0
    on = when or today()
    for enr in active_enrollments(user):
        if not program_open(enr.program, on, service):
            continue
        acc = budget_account(enr.company)
        acc = Account.objects.select_for_update().get(pk=acc.pk)
        covered = _coverage(allowance_of(enr, on), amount, acc.balance_kopecks)
        if covered <= 0:
            continue
        Charge.objects.create(
            company=enr.company, program=enr.program, enrollment=enr, service=service, ref=ref,
            covered_kopecks=covered, period_month=month_start(on), topic=topic, minutes=minutes,
        )
        return acc, covered
    return None, 0


def _local_date(dt) -> date:
    from .core import _tz

    return dt.astimezone(_tz()).date() if dt else today()


def reserve_call(session, amount: int):
    profile = session.psychologist_profile
    return reserve(
        session.client, amount, ref=session.pk, service="calls", when=_local_date(session.scheduled_at),
        topic=topic_for(getattr(profile, "specializations", [])), minutes=session.duration_minutes or 0,
    )


def reserve_group(user, amount: int, *, ref, scheduled_at=None, minutes: int = 0):
    """Групповые «Круги» (apps.circles): если программа включает услугу circles."""
    return reserve(user, amount, ref=ref, service="circles", when=_local_date(scheduled_at), topic="circles", minutes=minutes)


def company_share(ref):
    charge = Charge.objects.filter(ref=ref).select_related("company").first()
    if charge is None:
        return None, 0
    return budget_account(charge.company), charge.net_kopecks


def settled(ref, *, returned_kopecks: int = 0, refund: bool = False) -> None:
    charge = Charge.objects.select_for_update().filter(ref=ref).first()
    if charge is None:
        return
    charge.returned_kopecks = min(charge.covered_kopecks, charge.returned_kopecks + int(returned_kopecks))
    charge.status = Charge.Status.RETURNED if charge.net_kopecks <= 0 else Charge.Status.SETTLED
    charge.save(update_fields=["returned_kopecks", "status"])


def preview(user, amount: int, *, service: str = "calls", when: date | None = None) -> int:
    on = when or today()
    for enr in active_enrollments(user):
        if not program_open(enr.program, on, service):
            continue
        covered = _coverage(allowance_of(enr, on), int(amount), budget_balance(enr.company))
        if covered > 0:
            return covered
    return 0


def preview_call(user, amount: int) -> int:
    return preview(user, amount, service="calls")


def allowances_for(user) -> list[dict]:
    """Для клиента: его программы компаний и остаток на текущий период."""
    out = []
    on = today()
    for enr in active_enrollments(user):
        p = enr.program
        al = allowance_of(enr, on)
        ends = al.period_end
        expires = p.expires_on
        out.append({
            "id": str(enr.id),
            "company": enr.company.name,
            "program": p.name,
            "services": [s for s in Program.SERVICES if s in (p.services or [])],
            "period": p.period,
            "amount_kopecks": p.amount_kopecks,
            "calls_limit": p.calls_limit,
            "rub_left_kopecks": al.rub_left,
            "calls_left": al.calls_left,
            "renews_on": ends.isoformat() if not (expires and expires < ends) else None,
            "expires_on": expires.isoformat() if expires else None,
            "active": program_open(p, on, "calls") or any(program_open(p, on, s) for s in p.services or []),
            "budget_ok": budget_balance(enr.company) > 0,
        })
    return out


__all__ = [
    "reserve_call", "reserve", "company_share", "settled", "preview_call", "preview", "allowances_for",
    "budget_account", "budget_balance",
]
