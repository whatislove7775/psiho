"""
Агрегаты для компании — единственный источник чисел, которые видит HR.

Правила (проверяются тестами):
- никаких строк «на человека»: ни псевдонимов, ни id участников, ни специалистов;
- время — только месяцем; текущий месяц не раскрывается, пока не закончится
  (живой остаток бюджета и счётчики «в реальном времени» позволили бы по моменту
  изменения понять, кто воспользовался программой);
- количество людей, созвонов, часов, темы и оценки показываются, только если в периоде
  программой воспользовались не меньше k человек (k ≥ 5), иначе — null («менее 5»);
- суммы по закрытым месяцам показываются всегда: это акты, по ним компания платит.
"""
from __future__ import annotations

from datetime import date

from django.db.models import Count, Sum

from apps.billing.models import Account, Entry, LedgerTransaction

from .core import TOPICS, add_months, k_threshold, month_start, month_start_dt
from .funding import budget_balance
from .models import Charge, CodeBatch, Company, Enrollment

K = Account.Kind
T = LedgerTransaction.Kind

MONTHS_RU = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь",
             "ноябрь", "декабрь"]


def month_label(d: date) -> str:
    return f"{MONTHS_RU[d.month - 1]} {d.year}"


def masked(n: int, people: int) -> int | None:
    return n if people >= k_threshold() else None


def _closed(company: Company):
    """Списания по закрытым месяцам (текущий — ещё идёт)."""
    return Charge.objects.filter(company=company, period_month__lt=month_start()).exclude(status=Charge.Status.RETURNED)


def _account_key(company) -> str:
    return f"{K.COMPANY_BUDGET}:{company.pk}"


def budget_view(company: Company) -> dict:
    """Остаток на 1-е число + пополнения этого месяца. Живой остаток HR не видит."""
    start = month_start()
    start_dt = month_start_dt(start)
    entries = Entry.objects.filter(account__key=_account_key(company))
    at_start = entries.filter(created_at__lt=start_dt).aggregate(s=Sum("amount_kopecks"))["s"] or 0
    topups = entries.filter(created_at__gte=start_dt, transaction__kind__in=(T.COMPANY_TOPUP, T.COMPANY_ADJUSTMENT)) \
        .aggregate(s=Sum("amount_kopecks"))["s"] or 0
    available = at_start + topups
    live = budget_balance(company)
    # Один бит «бюджет заканчивается»: чтобы HR успел пополнить, но без сумм в реальном времени
    low = live <= 0 or (available > 0 and live < available * 0.15)
    total_topups = entries.filter(transaction__kind=T.COMPANY_TOPUP).aggregate(s=Sum("amount_kopecks"))["s"] or 0
    return {
        "as_of": start.isoformat(),
        "balance_at_month_start_kopecks": at_start,
        "topups_this_month_kopecks": topups,
        "available_kopecks": available,
        "low": bool(low),
        "topped_up_total_kopecks": total_topups,
    }


def monthly(company: Company, months: int = 12) -> list[dict]:
    rows = (
        _closed(company).values("period_month")
        .annotate(people=Count("enrollment", distinct=True), calls=Count("id"), minutes=Sum("minutes"),
                  covered=Sum("covered_kopecks"), returned=Sum("returned_kopecks"))
        .order_by("-period_month")[:months]
    )
    out = []
    for r in rows:
        people = r["people"]
        out.append({
            "month": r["period_month"].isoformat(),
            "label": month_label(r["period_month"]),
            "spent_kopecks": (r["covered"] or 0) - (r["returned"] or 0),
            "people": masked(people, people),
            "calls": masked(r["calls"], people),
            "hours": masked(round((r["minutes"] or 0) / 60, 1), people),
        })
    return out


def topics(company: Company, since: date | None = None) -> dict:
    """Доли тем среди созвонов. Тема видна, если к ней обращались ≥ k человек; остальное — одной строкой."""
    qs = _closed(company)
    if since:
        qs = qs.filter(period_month__gte=since)
    people_total = qs.values("enrollment").distinct().count()
    if people_total < k_threshold():
        return {"visible": False, "rows": [], "other_share": None}
    total_calls = qs.count()
    rows = []
    hidden_calls = 0
    for r in qs.values("topic").annotate(people=Count("enrollment", distinct=True), calls=Count("id")).order_by("-calls"):
        if r["people"] >= k_threshold() and r["topic"] != "other":
            rows.append({"topic": r["topic"], "label": TOPICS.get(r["topic"], "Другое"),
                         "share": round(r["calls"] / total_calls, 3)})
        else:
            hidden_calls += r["calls"]
    return {"visible": True, "rows": rows, "other_share": round(hidden_calls / total_calls, 3) if total_calls else 0}


def satisfaction(company: Company) -> dict:
    """Средняя оценка специалистов, которых оплачивала программа, от участников программы. Только при ≥ k оценивших."""
    from apps.reviews.models import Review
    from apps.sessions.models import ConsultationSession

    refs = list(_closed(company).filter(service="calls").values_list("ref", "enrollment__user_id"))
    if not refs:
        return {"visible": False, "average": None, "count": None}
    pairs = set(
        ConsultationSession.objects.filter(pk__in=[r for r, _ in refs]).values_list("client_id", "psychologist_profile_id")
    )
    users = {u for _, u in refs if u}
    reviews = Review.objects.filter(client_id__in=users, status=Review.Status.PUBLISHED) \
        .values_list("client_id", "psychologist_id", "rating")
    ratings = {}
    for client_id, psy_id, rating in reviews:
        if (client_id, psy_id) in pairs:
            ratings.setdefault(client_id, []).append(rating)
    people = len(ratings)
    if people < k_threshold():
        return {"visible": False, "average": None, "count": None}
    per_person = [sum(v) / len(v) for v in ratings.values()]  # каждый человек — один голос
    return {"visible": True, "average": round(sum(per_person) / people, 2), "count": people}


def codes_view(company: Company) -> dict:
    """Коды: сколько выпущено и (на 1-е число, при ≥ k) сколько активировано. Без статуса отдельных кодов."""
    issued = CodeBatch.objects.filter(company=company).aggregate(s=Sum("count"))["s"] or 0
    joined = Enrollment.objects.filter(company=company, joined_month__lt=month_start()).count()
    active_people = Enrollment.objects.filter(company=company, joined_month__lt=month_start(),
                                              status=Enrollment.Status.ACTIVE).count()
    return {
        "issued": issued,
        "activated": masked(joined, joined),
        "active_participants": masked(active_people, active_people),
        "as_of": month_start().isoformat(),
    }


def totals(company: Company) -> dict:
    qs = _closed(company)
    agg = qs.aggregate(c=Sum("covered_kopecks"), r=Sum("returned_kopecks"))
    people = qs.values("enrollment").distinct().count()
    return {
        "spent_kopecks": (agg["c"] or 0) - (agg["r"] or 0),
        "people": masked(people, people),
        "calls": masked(qs.count(), people),
    }


def acts(company: Company) -> list[dict]:
    """Акты: одна строка на закрытый месяц. Количество созвонов — только при ≥ k человек."""
    return [
        {"month": r["month"], "label": r["label"], "amount_kopecks": r["spent_kopecks"], "calls": r["calls"]}
        for r in monthly(company, months=36) if r["spent_kopecks"] > 0
    ]


def dashboard(company: Company) -> dict:
    return {
        "k_min": k_threshold(),
        "current_month": month_start().isoformat(),
        "budget": budget_view(company),
        "totals": totals(company),
        "codes": codes_view(company),
        "monthly": monthly(company),
        "topics": topics(company, since=add_months(month_start(), -12)),
        "satisfaction": satisfaction(company),
    }
