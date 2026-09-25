"""
Настройки баланса. Читаются из settings (удобно в тестах) с фолбэком на переменные окружения.
Все суммы — в рублях в env, внутри кода — в копейках.
"""
import os
from decimal import Decimal

from django.conf import settings

# Значения-заглушки из .env.example не считаются настоящими ключами
_PLACEHOLDERS = {"", "your-shop-id", "your-yookassa-secret", "changeme", "change-me"}


def _get(name: str, default):
    if hasattr(settings, name):
        return getattr(settings, name)
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    if isinstance(default, bool):
        return raw.strip().lower() in ("1", "true", "yes", "on")
    if isinstance(default, int):
        try:
            return int(raw)
        except ValueError:
            return default
    if isinstance(default, (float, Decimal)):
        try:
            return type(default)(raw)
        except Exception:
            return default
    if isinstance(default, (list, tuple)):
        return [x.strip() for x in raw.split(",") if x.strip()]
    return raw


def _real(value) -> str:
    value = (value or "").strip()
    return "" if value.lower() in _PLACEHOLDERS else value


# ── Провайдер пополнений ──────────────────────────────────────────

def yookassa_shop_id() -> str:
    return _real(_get("YOOKASSA_SHOP_ID", ""))


def yookassa_secret_key() -> str:
    return _real(_get("YOOKASSA_SECRET_KEY", ""))


def yookassa_live() -> bool:
    return bool(yookassa_shop_id() and yookassa_secret_key())


def mock_enabled() -> bool:
    """Тестовая касса: только в DEBUG (или явно BILLING_MOCK_ENABLED=true).

    На боевом сайте без ключей ЮKassa она выключена: иначе любой мог бы
    «пополнить» баланс тестовыми деньгами и записаться к реальному специалисту.
    Проверить оплату на проде можно подарочным кодом из /admin/finance."""
    explicit = _get("BILLING_MOCK_ENABLED", None)
    if explicit is not None and explicit != "":
        if isinstance(explicit, str):
            return explicit.strip().lower() in ("1", "true", "yes", "on")
        return bool(explicit)
    return bool(getattr(settings, "DEBUG", False))


def default_provider() -> str:
    return "yookassa" if yookassa_live() else "mock"


def confirmation_type() -> str:
    """redirect — страница ЮKassa; embedded — виджет на нашей странице."""
    value = str(_get("BILLING_YOOKASSA_CONFIRMATION", "redirect")).strip().lower()
    return value if value in ("redirect", "embedded") else "redirect"


def public_url() -> str:
    return str(_get("BILLING_PUBLIC_URL", "https://aprosop.ru")).rstrip("/")


def webhook_ip_check() -> bool:
    return bool(_get("BILLING_WEBHOOK_IP_CHECK", True))


# ── Выплаты ───────────────────────────────────────────────────────

def payout_agent_id() -> str:
    return _real(_get("YOOKASSA_PAYOUT_AGENT_ID", ""))


def payout_secret_key() -> str:
    return _real(_get("YOOKASSA_PAYOUT_SECRET_KEY", ""))


def yookassa_payouts_live() -> bool:
    return bool(payout_agent_id() and payout_secret_key())


def payout_min_kopecks() -> int:
    return int(_get("BILLING_PAYOUT_MIN_RUB", 500)) * 100


# ── Правила ───────────────────────────────────────────────────────

def platform_fee_percent() -> Decimal:
    return Decimal(str(getattr(settings, "PLATFORM_FEE_PERCENT", 20.0)))


def free_cancel_hours() -> int:
    return int(_get("BILLING_FREE_CANCEL_HOURS", 24))


def late_cancel_penalty_percent() -> int:
    return max(0, min(100, int(_get("BILLING_LATE_CANCEL_PENALTY_PERCENT", 50))))


def earnings_hold_hours() -> int:
    """Сколько заработок специалиста «созревает» (окно для спорных случаев) до доступного к выплате."""
    return int(_get("BILLING_EARNINGS_HOLD_HOURS", 24))


def unpaid_ttl_minutes() -> int:
    """Сколько держим время за неоплаченной записью."""
    return int(_get("BILLING_UNPAID_TTL_MINUTES", 30))


def settle_grace_minutes() -> int:
    """Через сколько после конца созвона незавершённый созвон рассчитывается автоматически."""
    return int(_get("BILLING_SETTLE_GRACE_MINUTES", 60))


def topup_min_kopecks() -> int:
    return int(_get("BILLING_TOPUP_MIN_RUB", 100)) * 100


def topup_max_kopecks() -> int:
    return int(_get("BILLING_TOPUP_MAX_RUB", 50000)) * 100


def topup_presets_rub() -> list[int]:
    raw = _get("BILLING_TOPUP_PRESETS_RUB", [1000, 3000, 5000, 10000])
    out = []
    for x in raw:
        try:
            out.append(int(x))
        except (TypeError, ValueError):
            continue
    return out or [1000, 3000, 5000, 10000]


def max_balance_kopecks() -> int:
    return int(_get("BILLING_MAX_BALANCE_RUB", 150000)) * 100


# ── Чеки (54-ФЗ) ──────────────────────────────────────────────────

def receipts_enabled() -> bool:
    """Передавать ли в ЮKassa данные для чека («Чеки от ЮKassa»)."""
    return bool(_get("BILLING_RECEIPTS_ENABLED", False))


def receipt_vat_code() -> int:
    return int(_get("BILLING_RECEIPT_VAT_CODE", 1))  # 1 = без НДС


def receipt_tax_system_code() -> int:
    return int(_get("BILLING_RECEIPT_TAX_SYSTEM_CODE", 0))  # 0 = не передавать


def receipt_payment_mode() -> str:
    return str(_get("BILLING_RECEIPT_PAYMENT_MODE", "full_prepayment"))


def receipt_payment_subject() -> str:
    return str(_get("BILLING_RECEIPT_PAYMENT_SUBJECT", "service"))


def receipt_item_description() -> str:
    return str(_get("BILLING_RECEIPT_ITEM", "Консультационные услуги (пополнение баланса)"))


def receipt_required() -> bool:
    """Если True — без email/телефона для чека пополнить нельзя."""
    return bool(_get("BILLING_RECEIPT_REQUIRED", False))


def encryption_keys() -> str:
    return str(_get("BILLING_ENCRYPTION_KEY", ""))
