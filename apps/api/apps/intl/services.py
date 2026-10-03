"""Запись согласий при регистрации. Фронтенд шлёт adult=true (обязательная галочка 18+),
health_data_consent=true (для стран ЕС/ЕЭЗ и Великобритании) и country из настроек."""
from .lang import request_country
from .models import Consent

# Редакция текстов, с которыми соглашаются (обновить вместе с документами)
CONSENT_VERSION = "2026-09"
# Страны, где сведения о здоровье — «особая категория» (GDPR / UK GDPR ст. 9) → нужно явное согласие
EXPLICIT_HEALTH_CONSENT = {"EU", "GB", "IE", "DE"}


def _truthy(value) -> bool:
    return value is True or str(value).lower() in {"1", "true", "yes", "on"}


def record_signup_consents(user, request) -> None:
    data = request.data if hasattr(request, "data") else {}
    country = (str(data.get("country") or "") or (request_country(request) or ""))[:2].upper()
    rows = []
    if _truthy(data.get("adult")):
        rows.append(Consent(user=user, kind=Consent.Kind.ADULT, country=country, version=CONSENT_VERSION))
    if _truthy(data.get("health_data_consent")):
        rows.append(Consent(user=user, kind=Consent.Kind.HEALTH_DATA, country=country, version=CONSENT_VERSION))
    if rows:
        Consent.objects.bulk_create(rows)
