"""
Шифрование содержимого чатов «на диске» (Fernet = AES-128-CBC + HMAC-SHA256).

Ключ: CHAT_ENCRYPTION_KEY (base64 urlsafe, 32 байта; можно несколько через запятую —
первый шифрует, остальные только расшифровывают, для ротации). Если не задан —
ключ выводится из SECRET_KEY (HKDF-SHA256), поэтому смена SECRET_KEY без
CHAT_ENCRYPTION_KEY сделает старые сообщения нечитаемыми.
"""
import base64
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from django.conf import settings

from . import conf


def _derived_key(secret: str) -> bytes:
    hkdf = HKDF(algorithm=hashes.SHA256(), length=32, salt=b"aprosop-chat-v1", info=b"chat-at-rest")
    return base64.urlsafe_b64encode(hkdf.derive(secret.encode("utf-8")))


@lru_cache(maxsize=4)
def _fernet(keys: str, secret: str) -> MultiFernet:
    parts = [k.strip() for k in keys.split(",") if k.strip()]
    if not parts:
        parts = [_derived_key(secret).decode()]
    return MultiFernet([Fernet(k.encode() if isinstance(k, str) else k) for k in parts])


def fernet() -> MultiFernet:
    return _fernet(conf.encryption_keys(), settings.SECRET_KEY)


def encrypt_bytes(data: bytes) -> bytes:
    return fernet().encrypt(data)


def decrypt_bytes(token: bytes | memoryview | None) -> bytes:
    if not token:
        return b""
    return fernet().decrypt(bytes(token))


def encrypt_text(text: str) -> bytes:
    return encrypt_bytes(text.encode("utf-8")) if text else b""


def decrypt_text(token: bytes | memoryview | None) -> str:
    try:
        return decrypt_bytes(token).decode("utf-8")
    except InvalidToken:
        # Ключ сменили без ротации — показываем заглушку, а не 500
        return ""
