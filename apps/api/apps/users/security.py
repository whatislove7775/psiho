"""
Единая точка для хеширования email и ключей восстановления.

Email никогда не хранится в открытом виде: только HMAC-подобный SHA-256 с
серверной солью (settings.EMAIL_HASH_SALT). Для обратной совместимости со
старыми аккаунтами поиск идёт также по хешу с исторической константой.
"""
import hashlib
import re
import secrets

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password

# Историческая соль, которой хешировались email до вынесения в настройки.
LEGACY_EMAIL_HASH_SALT = "ANON_PSY_EMAIL_SALT_v1"

_BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"


def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def hash_email(email: str, salt: str | None = None) -> str:
    salt = salt if salt is not None else current_email_salt()
    return hashlib.sha256(f"{salt}:{normalize_email(email)}".encode()).hexdigest()


def current_email_salt() -> str:
    return getattr(settings, "EMAIL_HASH_SALT", "") or LEGACY_EMAIL_HASH_SALT


def email_hash_candidates(email: str) -> list[str]:
    """Хеш с текущей солью первым, затем legacy (если соль отличается)."""
    hashes = [hash_email(email)]
    legacy = hash_email(email, LEGACY_EMAIL_HASH_SALT)
    if legacy not in hashes:
        hashes.append(legacy)
    return hashes


# ── Ключ восстановления ──────────────────────────────────────────

def generate_recovery_key() -> str:
    """4 группы по 5 символов base32 (100 бит энтропии): ABCDE-FGH23-..."""
    raw = "".join(secrets.choice(_BASE32) for _ in range(20))
    return "-".join(raw[i:i + 5] for i in range(0, 20, 5))


def normalize_recovery_key(key: str) -> str:
    return re.sub(r"[^A-Z2-7]", "", (key or "").upper())


def hash_recovery_key(key: str) -> str:
    return make_password(normalize_recovery_key(key))


def check_recovery_key(key: str, encoded: str) -> bool:
    if not encoded:
        return False
    normalized = normalize_recovery_key(key)
    if not normalized:
        return False
    return check_password(normalized, encoded)
