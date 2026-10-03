"""Курсы ЦБ РФ для подсказки «≈ $38» рядом с ценой в рублях (только подсказка: платежи — в рублях).

Официальный источник: https://www.cbr.ru/scripts/XML_daily.asp (кодировка windows-1251).
Кешируем на 12 часов; если ЦБ недоступен — пустой ответ, и фронтенд просто не показывает подсказку.
"""
import logging
import urllib.request
import xml.etree.ElementTree as ET
from decimal import Decimal, InvalidOperation

from django.core.cache import cache

logger = logging.getLogger(__name__)

URL = "https://www.cbr.ru/scripts/XML_daily.asp"
CODES = ("USD", "EUR", "GBP", "CAD", "KZT", "BYN", "UZS", "KGS", "AMD", "AZN", "GEL", "MDL", "UAH")
CACHE_KEY = "intl:cbr-rates:v1"


def parse(xml_bytes: bytes) -> dict:
    root = ET.fromstring(xml_bytes)
    out = {}
    for v in root.findall("Valute"):
        code = (v.findtext("CharCode") or "").strip()
        if code not in CODES:
            continue
        try:
            nominal = Decimal((v.findtext("Nominal") or "1").strip())
            value = Decimal((v.findtext("Value") or "").strip().replace(",", "."))
        except InvalidOperation:
            continue
        if nominal > 0 and value > 0:
            out[code] = float(round(value / nominal, 6))  # рублей за 1 единицу валюты
    return {"date": root.get("Date", ""), "source": "cbr.ru", "rub_per": out}


def fetch() -> dict:
    req = urllib.request.Request(URL, headers={"User-Agent": "aprosop-rates/1.0"})
    with urllib.request.urlopen(req, timeout=5) as resp:  # noqa: S310 — фиксированный https-адрес ЦБ
        return parse(resp.read())


def current() -> dict:
    data = cache.get(CACHE_KEY)
    if data is not None:
        return data
    try:
        data = fetch()
        cache.set(CACHE_KEY, data, 12 * 3600)
    except Exception as exc:  # noqa: BLE001
        logger.warning("intl.rates: %s", type(exc).__name__)
        data = {"date": "", "source": "cbr.ru", "rub_per": {}}
        cache.set(CACHE_KEY, data, 600)
    return data
