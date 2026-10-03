"""
Свой ник клиента: проверка, нормализация, доступность.

Ник = публичный псевдоним и логин клиента. Хранится в нормализованном виде
(нижний регистр, «ё»→«е», одиночные пробелы), поэтому уникальность и вход
нечувствительны к регистру. История прежних ников нигде не сохраняется —
специалисты видят только текущий ник.
"""
from __future__ import annotations

import re
from datetime import timedelta

from django.utils import timezone

from .aliases import normalize_alias

MIN_LEN = 3
MAX_LEN = 32
# Как часто можно менять ник (защита от «ротации» личности и перебора)
CHANGE_COOLDOWN = timedelta(days=1)

_ALLOWED = re.compile(r"^[a-zа-я0-9 _-]+$")
_HAS_LETTER = re.compile(r"[a-zа-я]")
_URLISH = re.compile(r"(^|[\s_-])(https?|www)($|[\s_-])|^(https?|www)")

# Служебные слова: ник не должен выдавать себя за сервис или сотрудника
RESERVED = (
    "admin", "administrator", "moderator", "support", "staff", "system", "aprosop", "official",
    "админ", "администратор", "модератор", "поддержка", "сотрудник", "апросоп",
    "официальный", "психолог", "специалист", "тиша",
)

# Базовый фильтр мата. Корни, опасные только как часть слова, — в SUBSTRINGS;
# короткие (частые внутри обычных слов: «рубля», «требую») — только целым словом.
PROFANITY_SUBSTRINGS = (
    "хуй", "хуе", "хуя", "хуи", "пизд", "ебат", "ебан", "ебал", "ебло", "ебну", "заеб", "выеб",
    "уебо", "уеба", "долбоеб", "мудак", "мудил", "пидор", "пидар", "шлюх", "гандон", "залуп",
    "fuck", "shit", "bitch", "cunt", "whore", "nigger", "nigga", "faggot", "asshole", "motherf",
)
PROFANITY_WORDS = (
    "бля", "блять", "блядь", "сука", "суки", "сучка", "манда", "педик", "говно", "дерьмо", "жопа",
    "dick", "cock", "pussy", "slut", "fag", "porn", "sex", "секс", "порно",
)

# Латиница, похожая на кириллицу, — чтобы не обходили фильтр «xyй»
_LOOKALIKE = str.maketrans({
    "a": "а", "e": "е", "o": "о", "p": "р", "c": "с", "x": "х", "y": "у", "k": "к", "m": "м",
    "t": "т", "h": "н", "b": "в", "3": "з", "0": "о", "u": "и",
})


def clean_alias(value: str) -> str:
    """Нормализованная форма ника (как хранится в базе)."""
    return normalize_alias(value)


def _is_profane(alias: str) -> bool:
    words = [w for w in re.split(r"[\s_\-\d]+", alias) if w]
    joined = "".join(words)
    variants = {joined, joined.translate(_LOOKALIKE)}
    for v in variants:
        if any(root in v for root in PROFANITY_SUBSTRINGS):
            return True
    for w in words:
        if w in PROFANITY_WORDS or w.translate(_LOOKALIKE) in PROFANITY_WORDS:
            return True
    return False


def alias_error(value: str) -> str | None:
    """Текст ошибки для ника или None, если формат допустим (без проверки занятости)."""
    alias = clean_alias(value)
    if len(alias) < MIN_LEN:
        return f"Не короче {MIN_LEN} символов."
    if len(alias) > MAX_LEN:
        return f"Не длиннее {MAX_LEN} символов."
    if "@" in alias or "." in alias or "/" in alias or ":" in alias:
        return "Ник не может быть почтой, ссылкой или @именем."
    if not _ALLOWED.match(alias):
        return "Только буквы, цифры, дефис, подчёркивание и пробел."
    if not _HAS_LETTER.search(alias):
        return "Нужна хотя бы одна буква."
    if sum(ch.isdigit() for ch in alias) >= 7:
        return "Слишком много цифр — похоже на номер телефона."
    if _URLISH.search(alias):
        return "Ник не может быть ссылкой."
    compact = re.sub(r"[\s_\-]+", "", alias)
    if any(word in compact for word in RESERVED):
        return "Такой ник зарезервирован."
    if _is_profane(alias):
        return "Выберите другой ник."
    return None


def is_taken(alias: str, exclude_user=None) -> bool:
    from .models import User

    qs = User.objects.filter(alias=clean_alias(alias))
    if exclude_user is not None:
        qs = qs.exclude(pk=exclude_user.pk)
    return qs.exists()


def check_alias(value: str, user=None) -> dict:
    """Ответ для живой проверки: {alias, available, error}."""
    alias = clean_alias(value)
    error = alias_error(alias)
    if error is None and is_taken(alias, exclude_user=user):
        error = "Этот ник уже занят."
    if error:
        from apps.intl.messages_en import tr  # S2: ответ 200 — middleware его не переводит

        error = tr(error)
    return {"alias": alias, "available": error is None, "error": error}


def next_change_at(user):
    """Когда пользователь сможет сменить ник снова (None — уже можно)."""
    changed = getattr(user, "alias_changed_at", None)
    if not changed:
        return None
    at = changed + CHANGE_COOLDOWN
    return at if at > timezone.now() else None
