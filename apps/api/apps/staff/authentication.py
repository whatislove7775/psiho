"""
JWT-аутентификация с поддержкой принудительного выхода.

Когда сотрудник завершает сеансы пользователя, в AccountStatus записывается
tokens_valid_after; все access-токены, выпущенные раньше, отклоняются сразу,
а не через 2 часа. Значение кэшируется, чтобы не ходить в БД на каждый запрос.
"""
import math

from django.core.cache import cache
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed

CACHE_TTL = 300


def _cache_key(user_id) -> str:
    return f"staff:tva:{user_id}"


def tokens_valid_after_ts(user_id) -> int:
    key = _cache_key(user_id)
    value = cache.get(key)
    if value is None:
        from .models import AccountStatus

        tva = (
            AccountStatus.objects.filter(user_id=user_id)
            .values_list("tokens_valid_after", flat=True)
            .first()
        )
        value = math.ceil(tva.timestamp()) if tva else 0
        cache.set(key, value, CACHE_TTL)
    return value


def forget_tokens_valid_after(user_id) -> None:
    cache.delete(_cache_key(user_id))


class RevocableJWTAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        cutoff = tokens_valid_after_ts(user.pk)
        if cutoff:
            iat = validated_token.get("iat")
            if iat is None or int(iat) < cutoff:
                raise AuthenticationFailed("Сеанс завершён. Войдите снова.", code="token_revoked")
        return user
