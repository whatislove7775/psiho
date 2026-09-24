from django.contrib.auth.backends import ModelBackend

from .aliases import normalize_alias
from .security import current_email_salt, email_hash_candidates, hash_email


def find_user_by_login(login: str):
    """Ищет пользователя по псевдониму или email (текущая и legacy-соль)."""
    from .models import User

    login = (login or "").strip()
    if not login:
        return None
    if "@" in login:
        for candidate in email_hash_candidates(login):
            user = User.objects.filter(email_hash=candidate).first()
            if user:
                return user
        return None
    user = User.objects.filter(alias=normalize_alias(login)).first()
    if user is None:
        user = User.objects.filter(alias=login).first()
    return user


class AliasOrEmailBackend(ModelBackend):
    """`username` (или `login`) = псевдоним или email."""

    def authenticate(self, request, username=None, password=None, login=None, **kwargs):
        identifier = login or username or kwargs.get("alias")
        if not identifier or password is None:
            return None
        user = find_user_by_login(identifier)
        if user is None:
            # Выравниваем время ответа, чтобы не раскрывать существование логина
            from .models import User
            User().set_password(password)
            return None
        if not (user.check_password(password) and self.user_can_authenticate(user)):
            return None
        # Прозрачная миграция legacy-хеша email на текущую соль
        if "@" in identifier:
            current = hash_email(identifier, current_email_salt())
            if user.email_hash != current:
                user.email_hash = current
                user.save(update_fields=["email_hash"])
        return user
