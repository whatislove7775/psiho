from datetime import time

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.users.models import PsychologistProfile, PsychologistSchedule, User


@pytest.fixture(autouse=True)
def _clean_cache(settings):
    settings.YOOKASSA_SHOP_ID = ""
    settings.YOOKASSA_SECRET_KEY = ""
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def api():
    return APIClient()


def auth_client(user) -> APIClient:
    from rest_framework_simplejwt.tokens import RefreshToken

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
    return client


@pytest.fixture
def client_user(db):
    return User.objects.create_anonymous_client("clientpass123")


@pytest.fixture
def psychologist(db):
    user = User.objects.create_psychologist(email="psy@example.com", password="psypass12345")
    profile = PsychologistProfile.objects.create(
        user=user,
        display_name="Анна",
        bio="Работаю с тревогой",
        specializations=["Тревога", "Отношения"],
        session_rate_rub=3000,
        verification_status=PsychologistProfile.VerificationStatus.APPROVED,
    )
    for weekday in range(7):
        PsychologistSchedule.objects.create(
            psychologist=profile, weekday=weekday, start_time=time(10), end_time=time(13)
        )
    return profile


@pytest.fixture
def admin_user(db):
    return User.objects.create_superuser(alias="admin", password="adminpass12345")
