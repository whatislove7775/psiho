"""
Шифрование реквизитов для выплат (Fernet). Ключ: BILLING_ENCRYPTION_KEY
(можно несколько через запятую для ротации), иначе выводится из SECRET_KEY (HKDF)
с отдельной «солью» — не совпадает с ключом чатов.
"""
import base64
import hashlib
import hmac
import json
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from django.conf import settings

from . import conf


def _derived(secret: str, info: bytes) -> bytes:
    hkdf = HKDF(algorithm=hashes.SHA256(), length=32, salt=b"aprosop-billing-v1", info=info)
    return base64.urlsafe_b64encode(hkdf.derive(secret.encode("utf-8")))


@lru_cache(maxsize=4)
def _fernet(keys: str, secret: str) -> MultiFernet:
    parts = [k.strip() for k in keys.split(",") if k.strip()] or [_derived(secret, b"payout-details").decode()]
    return MultiFernet([Fernet(k.encode()) for k in parts])


def encrypt_json(data: dict) -> bytes:
    return _fernet(conf.encryption_keys(), settings.SECRET_KEY).encrypt(json.dumps(data).encode("utf-8"))


def decrypt_json(token) -> dict:
    if not token:
        return {}
    try:
        raw = _fernet(conf.encryption_keys(), settings.SECRET_KEY).decrypt(bytes(token))
        return json.loads(raw.decode("utf-8"))
    except (InvalidToken, ValueError):
        return {}


def code_hash(code: str) -> str:
    """HMAC подарочного кода (коды не хранятся в открытом виде)."""
    key = _derived(settings.SECRET_KEY, b"gift-codes")
    return hmac.new(key, code.encode("utf-8"), hashlib.sha256).hexdigest()
