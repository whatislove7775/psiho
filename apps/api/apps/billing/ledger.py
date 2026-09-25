"""
Ядро двойной записи. Всё движение денег — только через post().

    post(kind, key, [(account, +100), (account2, -100)], ...)

- сумма проводок = 0, иначе LedgerError;
- idempotency_key уникален: повторный вызов с тем же ключом ничего не меняет
  и возвращает уже существующую операцию (created=False);
- пользовательские счета не уходят в минус (InsufficientFunds);
- счета блокируются (select_for_update) в порядке id — без взаимоблокировок.
"""
from __future__ import annotations

from django.db import IntegrityError, transaction
from django.db.models import F, Sum

from .models import Account, Entry, LedgerTransaction

K = Account.Kind


class LedgerError(Exception):
    pass


class InsufficientFunds(Exception):
    """Не хватает денег на балансе. shortfall_kopecks — сколько не хватает."""

    def __init__(self, shortfall_kopecks: int = 0, balance_kopecks: int = 0, message: str = "Недостаточно средств на балансе."):
        super().__init__(message)
        self.shortfall_kopecks = int(shortfall_kopecks)
        self.balance_kopecks = int(balance_kopecks)


def account_for(user, kind: str) -> Account:
    """Счёт пользователя данного вида (создаётся при первом обращении).

    user — объект или id: счёт ищется по ключу «вид:id» и переживает удаление аккаунта.
    """
    uid = getattr(user, "pk", user)
    key = f"{kind}:{uid}"
    acc = Account.objects.filter(key=key).first()
    if acc is not None:
        return acc
    try:
        with transaction.atomic():
            from django.contrib.auth import get_user_model

            owner = user if hasattr(user, "pk") else get_user_model().objects.filter(pk=uid).first()
            return Account.objects.create(key=key, kind=kind, user=owner)
    except IntegrityError:
        return Account.objects.get(key=key)


def system_account(kind: str, name: str = "main") -> Account:
    key = f"{kind}:{name}"
    acc = Account.objects.filter(key=key).first()
    if acc is not None:
        return acc
    try:
        with transaction.atomic():
            return Account.objects.create(key=key, kind=kind)
    except IntegrityError:
        return Account.objects.get(key=key)


def balance_of(user, kind: str = K.CLIENT) -> int:
    acc = Account.objects.filter(key=f"{kind}:{user.pk}").only("balance_kopecks").first()
    return acc.balance_kopecks if acc else 0


def post(kind: str, key: str, legs: list[tuple[Account, int]], *, session_id=None, memo: str = "",
         metadata: dict | None = None, by=None) -> tuple[LedgerTransaction, bool]:
    legs = [(acc, int(amount)) for acc, amount in legs if int(amount) != 0]
    if not legs:
        raise LedgerError("Пустая операция.")
    if sum(a for _, a in legs) != 0:
        raise LedgerError("Сумма проводок операции должна быть равна нулю.")

    existing = LedgerTransaction.objects.filter(idempotency_key=key).first()
    if existing is not None:
        return existing, False

    try:
        with transaction.atomic():
            ids = sorted({acc.pk for acc, _ in legs})
            locked = {a.pk: a for a in Account.objects.select_for_update().filter(pk__in=ids).order_by("pk")}
            # Повторная проверка под блокировкой (параллельный вызов с тем же ключом)
            existing = LedgerTransaction.objects.filter(idempotency_key=key).first()
            if existing is not None:
                return existing, False
            delta: dict[int, int] = {}
            for acc, amount in legs:
                delta[acc.pk] = delta.get(acc.pk, 0) + amount
            for pk, change in delta.items():
                acc = locked[pk]
                if acc.is_user_account and acc.balance_kopecks + change < 0:
                    raise InsufficientFunds(-(acc.balance_kopecks + change), acc.balance_kopecks)
            txn = LedgerTransaction.objects.create(
                kind=kind, idempotency_key=key, session_id=session_id, memo=memo[:200],
                metadata=metadata or {}, created_by=by if (by is not None and getattr(by, "is_authenticated", False)) else None,
            )
            Entry.objects.bulk_create([
                Entry(transaction=txn, account_id=acc.pk, amount_kopecks=amount, created_at=txn.created_at)
                for acc, amount in legs
            ])
            for pk, change in delta.items():
                # QuerySet.update у Account обычный (изменяем только кэш баланса)
                Account.objects.filter(pk=pk).update(balance_kopecks=F("balance_kopecks") + change)
            return txn, True
    except IntegrityError:
        existing = LedgerTransaction.objects.filter(idempotency_key=key).first()
        if existing is not None:
            return existing, False
        raise


def verify() -> dict:
    """Инварианты: сумма всех проводок = 0, каждая операция сбалансирована, кэш = сумме проводок."""
    total = Entry.objects.aggregate(s=Sum("amount_kopecks"))["s"] or 0
    unbalanced = list(
        Entry.objects.values("transaction_id").annotate(s=Sum("amount_kopecks")).exclude(s=0)
        .values_list("transaction_id", flat=True)[:20]
    )
    sums = dict(Entry.objects.values("account_id").annotate(s=Sum("amount_kopecks")).values_list("account_id", "s"))
    drift = []
    negative = []
    for acc in Account.objects.all().only("id", "key", "kind", "balance_kopecks"):
        real = sums.get(acc.pk, 0) or 0
        if real != acc.balance_kopecks:
            drift.append({"account": acc.key, "cached": acc.balance_kopecks, "entries": real})
        if acc.is_user_account and real < 0:
            negative.append(acc.key)
    return {
        "ok": total == 0 and not unbalanced and not drift and not negative,
        "total_kopecks": total,
        "unbalanced_transactions": [str(x) for x in unbalanced],
        "cache_drift": drift,
        "negative_user_accounts": negative,
    }
