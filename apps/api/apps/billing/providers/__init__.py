"""
Платёжные провайдеры пополнения баланса и «рельсы» выплат.

    get_provider("yookassa" | "mock")
    get_payout_rail("manual" | "yookassa")

Провайдер никогда не получает псевдоним или другие данные клиента: только сумму,
способ оплаты и (по желанию клиента) email/телефон для чека — он передаётся в запросе
и нигде у нас не сохраняется.
"""
from __future__ import annotations

import ipaddress
import logging
import uuid
from dataclasses import dataclass, field
from decimal import Decimal

from .. import conf

logger = logging.getLogger(__name__)


class ProviderError(Exception):
    pass


@dataclass
class ProviderPayment:
    id: str
    status: str  # pending | waiting_for_capture | succeeded | canceled
    amount_kopecks: int
    metadata: dict = field(default_factory=dict)
    confirmation_type: str = "redirect"
    confirmation_url: str = ""
    confirmation_token: str = ""
    test: bool = False


@dataclass
class ProviderRefund:
    id: str
    status: str  # pending | succeeded | canceled
    amount_kopecks: int = 0
    payment_id: str = ""


@dataclass
class ProviderPayout:
    id: str
    status: str  # pending | succeeded | canceled
    amount_kopecks: int = 0
    metadata: dict = field(default_factory=dict)


def rub(kopecks: int) -> str:
    return f"{Decimal(int(kopecks)) / 100:.2f}"


def kopecks(value) -> int:
    return int((Decimal(str(value)) * 100).quantize(Decimal("1")))


# Способы оплаты. value → тип payment_method_data в API ЮKassa (None — выбор на странице ЮKassa).
# Mir Pay отдельным способом в API ЮKassa не передаётся: карты «Мир» принимаются как bank_card,
# а Mir Pay доступен покупателю на платёжной странице ЮKassa, если его включили в личном кабинете.
METHODS = {
    "any": None,
    "bank_card": "bank_card",
    "sbp": "sbp",
    "sberbank": "sberbank",  # SberPay
    "tinkoff_bank": "tinkoff_bank",  # T-Pay
}
METHOD_LABELS = {
    "any": "Любой способ",
    "bank_card": "Банковская карта",
    "sbp": "СБП",
    "sberbank": "SberPay",
    "tinkoff_bank": "T-Pay",
}


# ── ЮKassa ────────────────────────────────────────────────────────

YOOKASSA_API = "https://api.yookassa.ru/v3"

# https://yookassa.ru/developers/using-api/webhooks#ip
YOOKASSA_NETWORKS = [
    ipaddress.ip_network(n) for n in (
        "185.71.76.0/27", "185.71.77.0/27", "77.75.153.0/25", "77.75.156.11/32",
        "77.75.156.35/32", "77.75.154.128/25", "2a02:5180::/32",
    )
]


def yookassa_ip_allowed(ip: str | None) -> bool:
    if not ip:
        return False
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return any(addr in net for net in YOOKASSA_NETWORKS)


class YooKassaClient:
    def __init__(self, account_id: str, secret: str):
        self.auth = (account_id, secret)

    def request(self, method: str, path: str, body: dict | None = None, idempotency_key: str | None = None) -> dict:
        import requests

        headers = {"Content-Type": "application/json"}
        if idempotency_key:
            headers["Idempotence-Key"] = idempotency_key
        try:
            resp = requests.request(method, f"{YOOKASSA_API}{path}", json=body, auth=self.auth, headers=headers, timeout=20)
        except Exception as exc:  # сеть
            raise ProviderError(f"ЮKassa недоступна: {exc.__class__.__name__}") from exc
        if resp.status_code >= 400:
            try:
                data = resp.json()
            except ValueError:
                data = {}
            raise ProviderError(f"ЮKassa {resp.status_code}: {data.get('code', '')} {data.get('description', '')}".strip())
        return resp.json()


def _payment_from(data: dict) -> ProviderPayment:
    conf_ = data.get("confirmation") or {}
    return ProviderPayment(
        id=data["id"],
        status=data.get("status", ""),
        amount_kopecks=kopecks((data.get("amount") or {}).get("value", "0")),
        metadata=data.get("metadata") or {},
        confirmation_type=conf_.get("type", ""),
        confirmation_url=conf_.get("confirmation_url", "") or "",
        confirmation_token=conf_.get("confirmation_token", "") or "",
        test=bool(data.get("test")),
    )


class YooKassaProvider:
    name = "yookassa"

    def client(self) -> YooKassaClient:
        return YooKassaClient(conf.yookassa_shop_id(), conf.yookassa_secret_key())

    def create_payment(self, topup, *, method: str, return_url: str, receipt_contact: dict | None) -> ProviderPayment:
        body: dict = {
            "amount": {"value": rub(topup.amount_kopecks), "currency": "RUB"},
            "capture": True,
            "description": "Пополнение баланса aprosop",
            "metadata": {"topup_id": str(topup.id)},
        }
        if conf.confirmation_type() == "embedded":
            body["confirmation"] = {"type": "embedded"}
        else:
            body["confirmation"] = {"type": "redirect", "return_url": return_url}
        pm = METHODS.get(method)
        if pm:
            body["payment_method_data"] = {"type": pm}
        if receipt_contact:
            item = {
                "description": conf.receipt_item_description()[:128],
                "quantity": "1.00",
                "amount": {"value": rub(topup.amount_kopecks), "currency": "RUB"},
                "vat_code": conf.receipt_vat_code(),
                "payment_mode": conf.receipt_payment_mode(),
                "payment_subject": conf.receipt_payment_subject(),
            }
            receipt: dict = {"customer": dict(receipt_contact), "items": [item]}
            if conf.receipt_tax_system_code():
                receipt["tax_system_code"] = conf.receipt_tax_system_code()
            body["receipt"] = receipt
        return _payment_from(self.client().request("POST", "/payments", body, idempotency_key=f"topup-{topup.id}"))

    def fetch_payment(self, payment_id: str) -> ProviderPayment:
        return _payment_from(self.client().request("GET", f"/payments/{payment_id}"))

    def refund(self, topup, amount_kopecks: int, key: str) -> ProviderRefund:
        data = self.client().request("POST", "/refunds", {
            "payment_id": topup.provider_payment_id,
            "amount": {"value": rub(amount_kopecks), "currency": "RUB"},
        }, idempotency_key=key)
        return ProviderRefund(id=data["id"], status=data.get("status", ""), amount_kopecks=amount_kopecks,
                              payment_id=data.get("payment_id", ""))

    def fetch_refund(self, refund_id: str) -> ProviderRefund:
        data = self.client().request("GET", f"/refunds/{refund_id}")
        return ProviderRefund(id=data["id"], status=data.get("status", ""),
                              amount_kopecks=kopecks((data.get("amount") or {}).get("value", "0")),
                              payment_id=data.get("payment_id", ""))

    def list_payments(self, created_gte: str, limit: int = 100) -> list[ProviderPayment]:
        data = self.client().request("GET", f"/payments?created_at.gte={created_gte}&limit={min(limit, 100)}")
        return [_payment_from(x) for x in data.get("items", [])]


class MockProvider:
    """Тестовая касса: платёж «оплачивается» на нашей же странице /app/balance/checkout."""

    name = "mock"

    def create_payment(self, topup, *, method: str, return_url: str, receipt_contact: dict | None) -> ProviderPayment:
        pid = f"mock-{uuid.uuid4().hex[:20]}"
        return ProviderPayment(
            id=pid, status="pending", amount_kopecks=topup.amount_kopecks, metadata={"topup_id": str(topup.id)},
            confirmation_type="redirect", confirmation_url=f"/app/balance/checkout?topup={topup.id}", test=True,
        )

    def fetch_payment(self, payment_id: str) -> ProviderPayment:
        from ..models import TopUp

        t = TopUp.objects.filter(provider_payment_id=payment_id).first()
        if t is None:
            raise ProviderError("Платёж не найден.")
        return ProviderPayment(id=payment_id, status=t.status, amount_kopecks=t.amount_kopecks,
                               metadata={"topup_id": str(t.id)}, test=True)

    def refund(self, topup, amount_kopecks: int, key: str) -> ProviderRefund:
        return ProviderRefund(id=f"mock-refund-{uuid.uuid4().hex[:16]}", status="succeeded",
                              amount_kopecks=amount_kopecks, payment_id=topup.provider_payment_id or "")

    def fetch_refund(self, refund_id: str) -> ProviderRefund:
        return ProviderRefund(id=refund_id, status="succeeded")

    def list_payments(self, created_gte: str, limit: int = 100) -> list[ProviderPayment]:
        return []


_PROVIDERS = {"yookassa": YooKassaProvider, "mock": MockProvider}


def get_provider(name: str):
    cls = _PROVIDERS.get(name)
    if cls is None:
        raise ProviderError(f"Неизвестный провайдер: {name}")
    return cls()


def available_providers() -> list[str]:
    out = []
    if conf.yookassa_live():
        out.append("yookassa")
    if conf.mock_enabled():
        out.append("mock")
    return out


# ── Выплаты ───────────────────────────────────────────────────────

class ManualRail:
    """Сотрудник переводит деньги сам (банк/СБП) и отмечает выплату в /admin/finance."""

    name = "manual"
    automatic = False

    def send(self, payout, details: dict) -> ProviderPayout | None:
        return None

    def fetch(self, payout_id: str) -> ProviderPayout:
        raise ProviderError("Ручные выплаты не запрашиваются у провайдера.")


class YooKassaPayoutRail:
    """Выплаты ЮKassa (шлюз «Выплаты», отдельные agentId и секретный ключ)."""

    name = "yookassa"
    automatic = True

    def client(self) -> YooKassaClient:
        return YooKassaClient(conf.payout_agent_id(), conf.payout_secret_key())

    def send(self, payout, details: dict) -> ProviderPayout:
        body: dict = {
            "amount": {"value": rub(payout.amount_kopecks), "currency": "RUB"},
            "description": "Выплата вознаграждения за консультации",
            "metadata": {"payout_request_id": str(payout.id)},
        }
        kind = details.get("kind")
        if kind == "sbp":
            if not details.get("bank_id"):
                raise ProviderError("Для выплаты через СБП нужен идентификатор банка.")
            body["payout_destination_data"] = {"type": "sbp", "phone": details["phone"], "bank_id": details["bank_id"]}
        elif kind == "card_token":
            body["payout_token"] = details["token"]
        else:
            raise ProviderError("Эти реквизиты ЮKassa не поддерживает — выплатите вручную.")
        if details.get("self_employed_id"):
            body["self_employed"] = {"id": details["self_employed_id"]}
            body["receipt_data"] = {"service_name": "Психологические консультации"}
        data = self.client().request("POST", "/payouts", body, idempotency_key=f"payout-{payout.id}")
        return ProviderPayout(id=data["id"], status=data.get("status", ""), amount_kopecks=payout.amount_kopecks,
                              metadata=data.get("metadata") or {})

    def fetch(self, payout_id: str) -> ProviderPayout:
        data = self.client().request("GET", f"/payouts/{payout_id}")
        return ProviderPayout(id=data["id"], status=data.get("status", ""),
                              amount_kopecks=kopecks((data.get("amount") or {}).get("value", "0")),
                              metadata=data.get("metadata") or {})


def get_payout_rail(name: str):
    if name == "yookassa":
        return YooKassaPayoutRail()
    return ManualRail()


def default_payout_rail() -> str:
    return "yookassa" if conf.yookassa_payouts_live() else "manual"
