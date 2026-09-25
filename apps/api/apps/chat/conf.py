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


def ai_enabled() -> bool:
    return bool(ai_api_key())
