"""S2: языки интерфейса и страны — перевод ошибок API, английские ники, согласия, язык материалов, Тиша."""
import pytest

from apps.chat import ai
from apps.content.models import Article, Practice
from apps.intl.crisis import safety_block
from apps.intl.lang import pick_language
from apps.intl.messages_en import translate
from apps.intl.models import Consent
from apps.users.models import User

from .conftest import auth_client


def test_pick_language():
    assert pick_language(None) == "ru"
    assert pick_language("en-US,en;q=0.9") == "en"
    assert pick_language("kk, ru;q=0.8, en;q=0.5") == "ru"
    assert pick_language("de-DE") == "ru"


def test_translate_plain_and_patterns():
    assert translate("Неверный пароль.", "en") == "Wrong password."
    assert translate("Не больше 30 символов.", "en") == "No more than 30 characters."
    assert translate("Неверный пароль.", "ru") == "Неверный пароль."
    assert translate("Что-то новое", "en") == "Что-то новое"


@pytest.mark.django_db
def test_api_errors_follow_accept_language(api, client_user):
    body = {"login": client_user.alias, "password": "wrong-password-1"}
    ru = api.post("/api/v1/auth/login/", body, format="json")
    en = api.post("/api/v1/auth/login/", body, format="json", HTTP_ACCEPT_LANGUAGE="en")
    assert ru.status_code == en.status_code == 400
    assert "Неверный" in str(ru.json())
    assert "Wrong login or password." in str(en.json())
    assert en["Content-Language"] == "en"


@pytest.mark.django_db
def test_signup_in_english_gets_latin_alias_and_records_consents(api):
    resp = api.post(
        "/api/v1/auth/anonymous/",
        {"password": "long-password-1", "adult": True, "health_data_consent": True, "country": "GB"},
        format="json",
        HTTP_ACCEPT_LANGUAGE="en",
    )
    assert resp.status_code == 201
    alias = resp.json()["user"]["alias"]
    assert alias.isascii()
    user = User.objects.get(alias=alias)
    kinds = set(Consent.objects.filter(user=user).values_list("kind", flat=True))
    assert kinds == {"adult", "health_data"}
    assert Consent.objects.filter(user=user, country="GB").count() == 2


@pytest.mark.django_db
def test_signup_in_russian_keeps_russian_alias(api):
    resp = api.post("/api/v1/auth/anonymous/", {"password": "long-password-1"}, format="json")
    assert resp.status_code == 201
    assert not resp.json()["user"]["alias"].isascii()


@pytest.mark.django_db
def test_feed_puts_requested_language_first(api):
    Article.objects.create(title="Тревога", slug="ru-one", content="<p>т</p>", is_published=True, language="ru")
    Article.objects.create(title="Anxiety", slug="en-one", content="<p>a</p>", is_published=True, language="en")
    items = api.get("/api/v1/content/articles/?lang=en&sort=new").json()
    rows = items["results"] if isinstance(items, dict) else items
    assert rows[0]["slug"] == "en-one" and rows[0]["language"] == "en"
    assert "ru-one" in {r["slug"] for r in rows}  # остальные языки — следом, не пропадают
    only = api.get("/api/v1/content/articles/?lang=en&lang_only=1").json()
    only = only["results"] if isinstance(only, dict) else only
    assert [r["slug"] for r in only] == ["en-one"]
    Practice.objects.create(title="Breathing", slug="p-en", is_published=True, language="en", order=200)
    Practice.objects.create(title="Дыхание", slug="p-ru", is_published=True, language="ru", order=1)
    ps = api.get("/api/v1/content/practices/?lang=en", HTTP_ACCEPT_LANGUAGE="en").json()
    ps = ps["results"] if isinstance(ps, dict) else ps
    assert ps[0]["slug"] == "p-en"
    assert ps[0]["kind_label"] == "Mindfulness"


@pytest.mark.django_db
def test_specialist_countries_and_licensure(psychologist):
    c = auth_client(psychologist.user)
    ok = c.patch("/api/v1/psychologist/profile/", {"serves_countries": ["ru", "KZ", "KZ"], "licensure": "Russia"}, format="json")
    assert ok.status_code == 200, ok.json()
    assert ok.json()["serves_countries"] == ["RU", "KZ"] and ok.json()["licensure"] == "Russia"
    bad = c.patch("/api/v1/psychologist/profile/", {"serves_countries": ["ZZ"]}, format="json", HTTP_ACCEPT_LANGUAGE="en")
    assert bad.status_code == 400 and "Unknown country." in str(bad.json())


def test_tisha_prompt_uses_language_and_country():
    en_us = ai.system_prompt("en", "US")
    assert "по-английски" in en_us and "988" in en_us and "8-800-333-44-34" not in en_us
    ru = ai.system_prompt("ru")
    assert "8-800-333-44-34" in ru and "по-русски" in ru
    assert "findahelpline.com" in safety_block("FR")
    assert ai.greeting("en").startswith("Hi, I'm Tisha")


CBR_XML = """<?xml version="1.0" encoding="windows-1251"?>
<ValCurs Date="29.09.2026" name="Foreign Currency Market">
<Valute ID="R01235"><NumCode>840</NumCode><CharCode>USD</CharCode><Nominal>1</Nominal><Name>Доллар США</Name><Value>90,5000</Value></Valute>
<Valute ID="R01335"><NumCode>398</NumCode><CharCode>KZT</CharCode><Nominal>100</Nominal><Name>Тенге</Name><Value>18,2000</Value></Valute>
<Valute ID="R01010"><NumCode>036</NumCode><CharCode>AUD</CharCode><Nominal>1</Nominal><Name>Австралийский доллар</Name><Value>60,0</Value></Valute>
</ValCurs>""".encode("cp1251")


@pytest.mark.django_db
def test_rates_endpoint_parses_cbr_and_fails_soft(api):
    from unittest import mock

    from apps.intl import rates

    parsed = rates.parse(CBR_XML)
    assert parsed["rub_per"] == {"USD": 90.5, "KZT": 0.182} and parsed["date"] == "29.09.2026"
    with mock.patch("apps.intl.rates.fetch", return_value=parsed):
        assert api.get("/api/v1/intl/rates/").json()["rub_per"]["USD"] == 90.5
    from django.core.cache import cache

    cache.delete(rates.CACHE_KEY)
    with mock.patch("apps.intl.rates.fetch", side_effect=OSError):
        assert api.get("/api/v1/intl/rates/").json()["rub_per"] == {}


def test_international_provider_is_a_stub():
    from apps.billing.providers import ProviderError, get_provider
    from apps.billing.providers.international import provider_for_country

    with pytest.raises(ProviderError):
        get_provider("international").create_payment(None, method="any", return_url="", receipt_contact=None)
    assert provider_for_country("US", ["yookassa"]) == "yookassa"
    assert provider_for_country("US", ["yookassa", "international"]) == "international"
    assert provider_for_country("RU", ["yookassa", "international"]) == "yookassa"
