import re

import pytest

from apps.users.models import PsychologistProfile, User
from apps.users.security import LEGACY_EMAIL_HASH_SALT, hash_email

from .conftest import auth_client

ALIAS_RE = re.compile(r"^[а-я]+-[а-я]+-\d{4}$")
KEY_RE = re.compile(r"^[A-Z2-7]{5}(-[A-Z2-7]{5}){3}$")


@pytest.mark.django_db
def test_anonymous_signup_login_and_recover(api):
    resp = api.post("/api/v1/auth/anonymous/", {"password": "secret-pass-1"}, format="json")
    assert resp.status_code == 201, resp.content
    body = resp.json()
    assert {"access", "refresh", "user", "recovery_key"} <= body.keys()
    user = body["user"]
    assert ALIAS_RE.match(user["alias"]), user["alias"]
    assert user["role"] == "client"
    assert user["has_email"] is False
    assert user["psychologist"] is None
    assert user["avatar_config"] is None
    assert KEY_RE.match(body["recovery_key"])
    db_user = User.objects.get(alias=user["alias"])
    assert db_user.email_hash is None
    assert body["recovery_key"] not in db_user.recovery_key_hash

    # login by alias (case-insensitive)
    resp = api.post("/api/v1/auth/login/", {"login": user["alias"].upper(), "password": "secret-pass-1"}, format="json")
    assert resp.status_code == 200, resp.content
    assert resp.json()["user"]["id"] == user["id"]

    resp = api.post("/api/v1/auth/login/", {"login": user["alias"], "password": "wrong-pass"}, format="json")
    assert resp.status_code == 400
    assert "detail" in resp.json()

    # wrong key
    resp = api.post("/api/v1/auth/recover/", {
        "alias": user["alias"], "recovery_key": "AAAAA-AAAAA-AAAAA-AAAAA", "new_password": "brand-new-pass",
    }, format="json")
    assert resp.status_code == 400

    # correct key (lowercase, without dashes is accepted too)
    key = body["recovery_key"].replace("-", "").lower()
    resp = api.post("/api/v1/auth/recover/", {
        "alias": user["alias"], "recovery_key": key, "new_password": "brand-new-pass",
    }, format="json")
    assert resp.status_code == 200, resp.content
    new_key = resp.json()["recovery_key"]
    assert new_key != body["recovery_key"]
    assert resp.json()["access"]

    # old key rotated, new password works
    resp = api.post("/api/v1/auth/recover/", {
        "alias": user["alias"], "recovery_key": body["recovery_key"], "new_password": "another-pass-1",
    }, format="json")
    assert resp.status_code == 400
    resp = api.post("/api/v1/auth/login/", {"login": user["alias"], "password": "brand-new-pass"}, format="json")
    assert resp.status_code == 200


@pytest.mark.django_db
def test_signup_rejects_short_password(api):
    resp = api.post("/api/v1/auth/anonymous/", {"password": "123"}, format="json")
    assert resp.status_code == 400
    assert "password" in resp.json()


@pytest.mark.django_db
def test_psychologist_register_and_email_login(api):
    resp = api.post("/api/v1/auth/register/psychologist/", {
        "email": "Doc@Example.com", "password": "docpass12345", "display_name": "Иван",
        "bio": "КПТ", "specializations": ["Тревога"], "session_rate_rub": 2500, "experience_years": 7,
    }, format="json")
    assert resp.status_code == 201, resp.content
    user = resp.json()["user"]
    assert user["role"] == "psychologist" and user["has_email"] is True
    assert user["psychologist"]["verification_status"] == "pending"
    assert user["psychologist"]["experience_years"] == 7
    assert user["psychologist"]["session_rate_rub"] == 2500

    resp = api.post("/api/v1/auth/login/", {"login": "doc@example.com", "password": "docpass12345"}, format="json")
    assert resp.status_code == 200

    dup = api.post("/api/v1/auth/register/psychologist/", {
        "email": "doc@example.com", "password": "docpass12345", "display_name": "X", "session_rate_rub": 1,
    }, format="json")
    assert dup.status_code == 400


@pytest.mark.django_db
def test_legacy_salt_login_is_migrated(api, settings):
    settings.EMAIL_HASH_SALT = "fresh-salt"
    user = User.objects.create(
        alias="psy_legacy", role="psychologist",
        email_hash=hash_email("old@example.com", LEGACY_EMAIL_HASH_SALT),
    )
    user.set_password("legacypass1")
    user.save()
    resp = api.post("/api/v1/auth/login/", {"login": "old@example.com", "password": "legacypass1"}, format="json")
    assert resp.status_code == 200
    user.refresh_from_db()
    assert user.email_hash == hash_email("old@example.com", "fresh-salt")


@pytest.mark.django_db
def test_me_patch_avatar(client_user):
    c = auth_client(client_user)
    resp = c.get("/api/v1/auth/me/")
    assert resp.status_code == 200 and resp.json()["alias"] == client_user.alias

    cfg = {"skin": "#f0c", "hair": {"style": "short", "color": "#000"}}
    resp = c.patch("/api/v1/auth/me/", {"avatar_config": cfg}, format="json")
    assert resp.status_code == 200, resp.content
    assert resp.json()["avatar_config"] == cfg
    client_user.refresh_from_db()
    assert client_user.avatar_config == cfg

    big = {"blob": "x" * 9000}
    resp = c.patch("/api/v1/auth/me/", {"avatar_config": big}, format="json")
    assert resp.status_code == 400
    resp = c.patch("/api/v1/auth/me/", {"avatar_config": [1, 2]}, format="json")
    assert resp.status_code == 400
    # alias/role are read-only
    resp = c.patch("/api/v1/auth/me/", {"alias": "hacker", "role": "admin"}, format="json")
    assert resp.status_code == 200
    assert resp.json()["alias"] == client_user.alias and resp.json()["role"] == "client"
    resp = c.patch("/api/v1/auth/me/", {"avatar_config": None}, format="json")
    assert resp.json()["avatar_config"] is None


@pytest.mark.django_db
def test_change_password_and_delete(client_user, psychologist):
    c = auth_client(client_user)
    assert c.post("/api/v1/auth/me/password/", {"old_password": "bad", "new_password": "newpass1234"}, format="json").status_code == 400
    resp = c.post("/api/v1/auth/me/password/", {"old_password": "clientpass123", "new_password": "newpass1234"}, format="json")
    assert resp.status_code == 204
    client_user.refresh_from_db()
    assert client_user.check_password("newpass1234")

    from apps.sessions.models import ConsultationSession
    from django.utils import timezone
    ConsultationSession.objects.create(
        client=client_user, psychologist_profile=psychologist, scheduled_at=timezone.now(),
        amount_kopecks=300000, status="paid",
    )
    assert c.post("/api/v1/auth/me/delete/", {"password": "wrong"}, format="json").status_code == 400
    assert c.post("/api/v1/auth/me/delete/", {"password": "newpass1234"}, format="json").status_code == 204
    assert not User.objects.filter(pk=client_user.pk).exists()
    assert ConsultationSession.objects.count() == 0

    # psychologist deletion removes the profile too
    p = auth_client(psychologist.user)
    assert p.post("/api/v1/auth/me/delete/", {"password": "psypass12345"}, format="json").status_code == 204
    assert not PsychologistProfile.objects.exists()


@pytest.mark.django_db
def test_create_admin_command(monkeypatch):
    from django.core.management import call_command

    monkeypatch.delenv("ADMIN_LOGIN", raising=False)
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)
    call_command("create_admin")
    assert not User.objects.exists()
    monkeypatch.setenv("ADMIN_LOGIN", "Chief")
    monkeypatch.setenv("ADMIN_PASSWORD", "a-very-long-password")
    call_command("create_admin")
    call_command("create_admin")
    admin = User.objects.get()
    assert admin.alias == "chief" and admin.role == "admin" and admin.is_staff
