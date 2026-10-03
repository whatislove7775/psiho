"""Язык и страна запроса.

Фронтенд шлёт `Accept-Language: ru|en` (язык интерфейса) и `X-Country: RU|US|…` (страна из настроек —
только для телефонов помощи у Тиши; нигде не сохраняется). Поддерживаемые языки — settings.LANGUAGES.
"""
from django.conf import settings

SUPPORTED = tuple(code for code, _ in getattr(settings, "LANGUAGES", [("ru", "")]))
DEFAULT = "ru"


def pick_language(header: str | None) -> str:
    """Первый поддерживаемый язык из Accept-Language (по q), иначе ru."""
    if not header:
        return DEFAULT
    tags = []
    for i, part in enumerate(header.split(",")):
        tag, _, q = part.strip().partition(";q=")
        try:
            weight = float(q) if q else 1.0
        except ValueError:
            weight = 0.0
        tags.append((-weight, i, tag.strip().lower().split("-")[0]))
    for _, _, base in sorted(tags):
        if base in SUPPORTED:
            return base
    return DEFAULT


def request_language(request) -> str:
    return getattr(request, "LANGUAGE_CODE", None) or pick_language(request.META.get("HTTP_ACCEPT_LANGUAGE"))


def request_country(request) -> str | None:
    value = (request.META.get("HTTP_X_COUNTRY") or "").strip().upper()[:2]
    return value if value.isalpha() and len(value) == 2 else None
