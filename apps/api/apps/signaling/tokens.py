"""Подписанные токены доступа к комнате сигналинга (выдаются в /sessions/{id}/join/)."""
from django.core import signing

WS_TOKEN_SALT = "aprosop-ws"
WS_TOKEN_MAX_AGE = 3 * 60 * 60  # 3 часа


def make_ws_token(user_id, room_id, role: str) -> str:
    return signing.dumps(
        {"user_id": str(user_id), "room_id": str(room_id), "role": role},
        salt=WS_TOKEN_SALT,
        compress=True,
    )


def validate_ws_token(token: str | None, room_id) -> dict | None:
    """Возвращает payload токена, если подпись верна, не истёк и комната совпадает."""
    if not token:
        return None
    try:
        data = signing.loads(token, salt=WS_TOKEN_SALT, max_age=WS_TOKEN_MAX_AGE)
    except (signing.BadSignature, signing.SignatureExpired, ValueError, TypeError):
        return None
    if not isinstance(data, dict):
        return None
    if str(data.get("room_id")) != str(room_id):
        return None
    if data.get("role") not in ("client", "psychologist") or not data.get("user_id"):
        return None
    return data
