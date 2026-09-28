"""R9: необязательный год рождения специалиста → возраст на карточках; «на сервисе с»."""
from datetime import timedelta

import pytest
from django.utils import timezone

from .conftest import auth_client

ME = "/api/v1/psychologist/profile/"


@pytest.mark.django_db
def test_birth_year_optional_and_private(psychologist, api):
    owner = auth_client(psychologist.user)
    me = owner.get(ME).json()
    assert me["birth_year"] is None and me["age"] is None
    public = api.get(f"/api/v1/psychologists/{psychologist.pk}/").json()
    assert public["age"] is None and "birth_year" not in public

    year = timezone.now().year
    assert owner.patch(ME, {"birth_year": year - 10}, format="json").status_code == 400
    assert owner.patch(ME, {"birth_year": 1800}, format="json").status_code == 400
    res = owner.patch(ME, {"birth_year": year - 32}, format="json")
    assert res.status_code == 200 and res.json()["birth_year"] == year - 32
    public = api.get(f"/api/v1/psychologists/{psychologist.pk}/").json()
    assert public["age"] == 32 and "birth_year" not in public
    body = api.get("/api/v1/psychologists/").json()
    rows = body["results"] if isinstance(body, dict) else body
    row = next(r for r in rows if r["id"] == psychologist.pk)
    assert row["age"] == 32 and "birth_year" not in row and row["on_service_since"]
    # Можно убрать
    assert owner.patch(ME, {"birth_year": None}, format="json").json()["age"] is None


@pytest.mark.django_db
def test_on_service_since_prefers_approval_date(psychologist, api):
    approved = timezone.now() - timedelta(days=100)
    psychologist.verified_at = approved
    psychologist.save(update_fields=["verified_at"])
    data = api.get(f"/api/v1/psychologists/{psychologist.pk}/").json()
    assert data["on_service_since"] == approved.date().isoformat()
    psychologist.verified_at = None
    psychologist.save(update_fields=["verified_at"])
    data = api.get(f"/api/v1/psychologists/{psychologist.pk}/").json()
    assert data["on_service_since"] == psychologist.created_at.date().isoformat()
