"""
Ссылки-приглашения в тестовую комнату.

Токен подписан отдельной солью (не совпадает с токенами сигналинга и JWT),
действует не дольше жизни комнаты и даёт доступ только к одной роли в одной
тестовой комнате. Обычные сессии эти токены не открывают: /lab/join/ ищет
только TestRoom, а ws-токен выдаётся на её собственный канал сигналинга.
"""
from django.core import signing

from .models import TEST_ROOM_TTL

LAB_TOKEN_SALT = "aprosop-lab-join"
LAB_ROLES = ("client", "psychologist")


def make_lab_token(room_id, role: str) -> str:
    assert role in LAB_ROLES
    return signing.dumps({"room": str(room_id), "role": role}, salt=LAB_TOKEN_SALT, compress=True)


def read_lab_token(token: str | None) -> dict | None:
    if not token or not isinstance(token, str) or len(token) > 512:
        return None
    try:
        data = signing.loads(token, salt=LAB_TOKEN_SALT, max_age=TEST_ROOM_TTL.total_seconds())
    except (signing.BadSignature, signing.SignatureExpired, ValueError, TypeError):
        return None
    if not isinstance(data, dict) or data.get("role") not in LAB_ROLES or not data.get("room"):
        return None
    return data
