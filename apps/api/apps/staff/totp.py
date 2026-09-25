"""
TOTP (RFC 6238) для двухфакторного входа сотрудников — без внешних зависимостей.

Совместим с Google Authenticator, Яндекс Ключом, 1Password и др.:
SHA-1, 6 цифр, шаг 30 секунд, допуск ±1 шаг. Повтор уже использованного кода
отклоняется (StaffMember.totp_last_step).
"""
import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings

STEP = 30
DIGITS = 6
ISSUER = "aprosop"


def generate_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _code(secret: str, counter: int) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8), casefold=True)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return str(value % (10 ** DIGITS)).zfill(DIGITS)


def current_step(now: float | None = None) -> int:
    return int((now if now is not None else time.time()) // STEP)


def code_at(secret: str, now: float | None = None) -> str:
    return _code(secret, current_step(now))


def verify(secret: str, code: str, *, last_step: int = 0, now: float | None = None) -> int | None:
    """Шаг, на котором код совпал (для защиты от повтора), или None."""
    code = "".join(ch for ch in str(code or "") if ch.isdigit())
    if len(code) != DIGITS or not secret:
        return None
    step = current_step(now)
    for candidate in (step - 1, step, step + 1):
        if candidate <= last_step:
            continue
        if hmac.compare_digest(_code(secret, candidate), code):
            return candidate
    return None


def provisioning_uri(secret: str, account: str) -> str:
    label = quote(f"{ISSUER}:{account}")
    return f"otpauth://totp/{label}?secret={secret}&issuer={ISSUER}&digits={DIGITS}&period={STEP}"


# ── Шифрование секрета в БД ─────────────────────────────────────────

def _fernet() -> Fernet:
    key = hashlib.sha256(f"staff-totp:{settings.SECRET_KEY}".encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt_secret(secret: str) -> str:
    return _fernet().encrypt(secret.encode()).decode() if secret else ""


def decrypt_secret(token: str) -> str:
    if not token:
        return ""
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        return ""
