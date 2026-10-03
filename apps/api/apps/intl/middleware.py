"""Язык ответов API.

1. Активирует язык запроса (Accept-Language → ru/en): встроенные сообщения Django/DRF
   («This field is required.») приходят на языке интерфейса.
2. Наши собственные сообщения написаны по-русски прямо в коде; для англоязычного интерфейса
   middleware переводит тексты ошибок (detail и ошибки полей) по словарю messages_en.EN.
   Неизвестная строка остаётся русской — фронтенд тогда покажет её как есть.
Переводим только JSON-ответы API с кодом ≥ 400: данные (сообщения чатов, статьи) не трогаем.
"""
import json

from django.utils import translation

from .lang import pick_language
from .messages_en import translate


def _walk(value, lang):
    if isinstance(value, str):
        return translate(value, lang)
    if isinstance(value, list):
        return [_walk(v, lang) for v in value]
    if isinstance(value, dict):
        # «code» — машинный идентификатор, его не переводим
        return {k: (v if k == "code" else _walk(v, lang)) for k, v in value.items()}
    return value


class ApiLanguageMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        lang = pick_language(request.META.get("HTTP_ACCEPT_LANGUAGE"))
        request.LANGUAGE_CODE = lang
        translation.activate(lang)
        try:
            response = self.get_response(request)
        finally:
            translation.deactivate()
        if lang != "ru" and response.status_code >= 400 and request.path.startswith("/api/"):
            ctype = response.get("Content-Type", "")
            if ctype.startswith("application/json") and not getattr(response, "streaming", False):
                try:
                    data = json.loads(response.content or b"null")
                except ValueError:
                    return response
                new = _walk(data, lang)
                if new != data:
                    response.content = json.dumps(new, ensure_ascii=False).encode("utf-8")
                    if response.has_header("Content-Length"):
                        response["Content-Length"] = str(len(response.content))
        response.headers.setdefault("Content-Language", lang)
        patch = response.get("Vary", "")
        if "Accept-Language" not in patch:
            response["Vary"] = f"{patch}, Accept-Language" if patch else "Accept-Language"
        return response
