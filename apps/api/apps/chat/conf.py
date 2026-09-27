"""Настройки чатов. Читаются из settings (для тестов) с фолбэком на переменные окружения."""
import os

from django.conf import settings


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
    return raw


def encryption_keys() -> str:
    return _get("CHAT_ENCRYPTION_KEY", "")


def allow_without_booking() -> bool:
    """Клиент может начать диалог со специалистом без записи (с антиспам-лимитами apps.dialogs.policy).
    False — прежнее правило «писать только после записи»."""
    return _get("CHAT_ALLOW_WITHOUT_BOOKING", True)


def max_file_bytes() -> int:
    return _get("CHAT_MAX_FILE_MB", 20) * 1024 * 1024


def max_voice_bytes() -> int:
    return _get("CHAT_MAX_VOICE_MB", 10) * 1024 * 1024


def send_rate() -> str:
    return _get("CHAT_SEND_RATE", "40/min")


def ai_api_key() -> str:
    return _get("ANTHROPIC_API_KEY", "")


def ai_model() -> str:
    return _get("AI_MODEL", "claude-sonnet-5")


def ai_effort() -> str:
    return _get("AI_EFFORT", "medium")


def ai_daily_limit() -> int:
    return _get("AI_DAILY_LIMIT", 40)


def ai_provider() -> str:
    """anthropic (по умолчанию) | gigachat | openai_compatible."""
    return str(_get("AI_PROVIDER", "anthropic")).strip().lower() or "anthropic"


# ── GigaChat (Сбер) ── см. docs/AI.md
def gigachat_auth_key() -> str:
    """«Ключ авторизации» из личного кабинета (base64 от client_id:client_secret)."""
    return _get("GIGACHAT_AUTH_KEY", "")


def gigachat_client_id() -> str:
    return _get("GIGACHAT_CLIENT_ID", "")


def gigachat_client_secret() -> str:
    return _get("GIGACHAT_CLIENT_SECRET", "")


def gigachat_scope() -> str:
    # GIGACHAT_API_PERS — физлица (Freemium), GIGACHAT_API_B2B / GIGACHAT_API_CORP — юрлица
    return _get("GIGACHAT_SCOPE", "GIGACHAT_API_PERS")


def gigachat_model() -> str:
    return _get("GIGACHAT_MODEL", "GigaChat-2")


def gigachat_auth_url() -> str:
    return _get("GIGACHAT_AUTH_URL", "https://ngw.devices.sberbank.ru:9443/api/v2/oauth")


def gigachat_base_url() -> str:
    return _get("GIGACHAT_BASE_URL", "https://api.giga.chat/v1")


def gigachat_ca_bundle() -> str:
    """Путь к сертификату «Russian Trusted Root CA» (НУЦ Минцифры) в формате PEM."""
    explicit = _get("GIGACHAT_CA_BUNDLE", "")
    if explicit:
        return explicit
    # Сертификаты НУЦ Минцифры лежат в репозитории (deploy/certs → /app/certs).
    import os

    bundled = "/app/certs/russian_trusted_ca.pem"
    return bundled if os.path.exists(bundled) else ""


# ── OpenAI-совместимые (OpenRouter, YandexGPT, Ollama…) ──
def openai_base_url() -> str:
    return _get("OPENAI_BASE_URL", "")


def openai_api_key() -> str:
    return _get("OPENAI_API_KEY", "")


def openai_model() -> str:
    return _get("OPENAI_MODEL", "")


def openai_ca_bundle() -> str:
    return _get("OPENAI_CA_BUNDLE", "")


def ai_enabled() -> bool:
    from .ai import enabled

    return enabled()
