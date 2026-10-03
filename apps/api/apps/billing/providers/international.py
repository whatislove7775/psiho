"""
Заготовка провайдера для оплаты из-за рубежа (S2). НЕ подключён: ЮKassa принимает только рубли,
а карты, выпущенные вне России, через российский эквайринг сейчас, как правило, не проходят.

Чтобы принимать клиентов из ЕС/США, нужен отдельный провайдер (Stripe, Paddle, Lemon Squeezy —
merchant of record; CloudPayments/Robokassa — для части стран СНГ) и, скорее всего, отдельное
юрлицо вне РФ — см. docs/INTERNATIONAL.md. Интерфейс совпадает с YooKassaProvider/MockProvider:

    create_payment(topup, *, method, return_url, receipt_contact) -> ProviderPayment
    fetch_payment(payment_id) -> ProviderPayment
    refund(topup, amount_kopecks, key) -> ProviderRefund
    fetch_refund(refund_id) -> ProviderRefund
    list_payments(created_gte, limit) -> list[ProviderPayment]

Баланс внутри сервиса остаётся рублёвым (TopUp.amount_kopecks): провайдер берёт деньги в валюте
клиента и зачисляет эквивалент в рублях по курсу на момент оплаты (курс и валюту сохранить в metadata).
Вебхук — отдельный эндпоинт по образцу apps/billing (проверка подписи провайдера обязательна).
"""
from __future__ import annotations

from . import ProviderError, ProviderPayment, ProviderRefund

SUPPORTED_CURRENCIES = ("USD", "EUR", "GBP", "KZT")


class InternationalProvider:
    name = "international"

    def _off(self):
        raise ProviderError("Оплата из-за рубежа пока не подключена.")

    def create_payment(self, topup, *, method: str, return_url: str, receipt_contact: dict | None) -> ProviderPayment:
        self._off()

    def fetch_payment(self, payment_id: str) -> ProviderPayment:
        self._off()

    def refund(self, topup, amount_kopecks: int, key: str) -> ProviderRefund:
        self._off()

    def fetch_refund(self, refund_id: str) -> ProviderRefund:
        self._off()

    def list_payments(self, created_gte: str, limit: int = 100) -> list[ProviderPayment]:
        return []


def provider_for_country(country: str | None, available: list[str]) -> str | None:
    """Какой провайдер предлагать клиенту из страны `country` (код из настроек, см. apps.intl).

    Россия и страны, где работают российские карты/СБП, — ЮKassa; остальные — международный,
    когда он будет подключён (сейчас в available его нет, и остаётся ЮKassa)."""
    domestic = {"RU"}
    if (country or "RU").upper() not in domestic and "international" in available:
        return "international"
    for name in ("yookassa", "mock"):
        if name in available:
            return name
    return None
