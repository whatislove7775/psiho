"""Консоль персонала: матрица прав, журнал действий, блокировки, 2FA, жалобы."""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework_simplejwt.tokens import RefreshToken

from apps.sessions.models import ConsultationSession
from apps.staff import totp
from apps.staff.models import AuditLog, Report, StaffMember
from apps.staff.roles import PERMISSIONS, ROLES, get_staff_role, has_staff_perm
from apps.users.models import PsychologistProfile, User

from .conftest import auth_client


def make_staff(role, alias=None):
    user = User.objects.create_user(alias=alias or f"staff-{role}", password="staffpass12345", role="admin")
    StaffMember.objects.create(user=user, role=role)
    return user


@pytest.fixture
def staff(db):
    return {role: make_staff(role) for role in ROLES if role != "owner"}


@pytest.fixture
def session(client_user, psychologist):
    return ConsultationSession.objects.create(
        client=client_user, psychologist_profile=psychologist, status="paid",
        scheduled_at=timezone.now() + timedelta(days=1), duration_minutes=50, amount_kopecks=300000,
    )


# ── Роли ──────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_role_resolution_and_legacy_mapping(admin_user, client_user, psychologist):
    assert get_staff_role(admin_user) == "owner"  # ADMIN_LOGIN-суперпользователь
    legacy = User.objects.create_user(alias="old-admin", password="x" * 12, role="admin")
    assert get_staff_role(legacy) == "admin"
    flagged = User.objects.create_user(alias="flagged", password="x" * 12, is_staff=True)
    assert get_staff_role(flagged) == "admin"
    assert get_staff_role(client_user) is None
    assert get_staff_role(psychologist.user) is None
    editor = make_staff("editor")
    assert has_staff_perm(editor, "content.edit") and not has_staff_perm(editor, "users.view")
    StaffMember.objects.filter(user=editor).update(is_active=False)
    editor = User.objects.get(pk=editor.pk)
    assert get_staff_role(editor) is None and not has_staff_perm(editor, "content.edit")
    with pytest.raises(KeyError):
        has_staff_perm(admin_user, "no.such.perm")


ENDPOINT_PERMS = [
    ("/api/v1/staff/dashboard/", "dashboard.view"),
    ("/api/v1/staff/users/", "users.view"),
    ("/api/v1/staff/specialists/", "specialists.view"),
    ("/api/v1/staff/sessions/", "sessions.view"),
    ("/api/v1/staff/reports/", "reports.view"),
    ("/api/v1/staff/audit/", "audit.view"),
    ("/api/v1/staff/system/", "system.view"),
    ("/api/v1/staff/members/", "staff.view"),
    ("/api/v1/admin-panel/psychologists/", "specialists.view"),
    ("/api/v1/admin-panel/sessions/", "sessions.view"),
]


@pytest.mark.django_db
def test_permission_matrix_for_read_endpoints(staff, admin_user, client_user, psychologist):
    everyone = {**staff, "owner": admin_user}
    for role, user in everyone.items():
        c = auth_client(user)
        me = c.get("/api/v1/staff/me/").json()
        assert me["role"] == role
        assert set(me["permissions"]) == {p for p, roles in PERMISSIONS.items() if role in roles}
        for url, perm in ENDPOINT_PERMS:
            expected = 200 if role in PERMISSIONS[perm] else 403
            assert c.get(url).status_code == expected, (role, url)
    for outsider in (client_user, psychologist.user):
        c = auth_client(outsider)
        assert c.get("/api/v1/staff/me/").status_code == 403
        for url, _ in ENDPOINT_PERMS:
            assert c.get(url).status_code == 403, url
    from rest_framework.test import APIClient
    assert APIClient().get("/api/v1/staff/dashboard/").status_code == 401


@pytest.mark.django_db
def test_revenue_hidden_from_non_admin(staff, admin_user):
    assert auth_client(staff["moderator"]).get("/api/v1/staff/dashboard/").json()["revenue"] is None
    assert auth_client(admin_user).get("/api/v1/staff/dashboard/").json()["revenue"] is not None
    dev = auth_client(staff["developer"]).get("/api/v1/staff/dashboard/").json()
    assert dev["system"]["status"] in ("ok", "degraded") and dev["users"]["clients"] == 0


# ── Пользователи: блокировка, выход, приватность ─────────────────────

@pytest.mark.django_db
def test_block_unblock_and_force_logout_are_audited(staff, client_user, api):
    victim_token = auth_client(client_user)
    assert victim_token.get("/api/v1/auth/me/").status_code == 200
    mod = auth_client(staff["moderator"])

    assert mod.post(f"/api/v1/staff/users/{client_user.id}/block/", {"reason": ""}, format="json").status_code == 400
    resp = mod.post(f"/api/v1/staff/users/{client_user.id}/block/", {"reason": "Спам в чатах"}, format="json")
    assert resp.status_code == 200 and resp.json()["blocked"] is True
    assert victim_token.get("/api/v1/auth/me/").status_code == 401
    login = api.post("/api/v1/auth/login/", {"login": client_user.alias, "password": "clientpass123"}, format="json")
    assert login.status_code == 400

    resp = mod.post(f"/api/v1/staff/users/{client_user.id}/unblock/", {}, format="json")
    assert resp.status_code == 200 and resp.json()["blocked"] is False
    fresh = api.post("/api/v1/auth/login/", {"login": client_user.alias, "password": "clientpass123"}, format="json")
    assert fresh.status_code == 200

    # Поддержка может завершить сеансы, но не блокировать
    sup = auth_client(staff["support"])
    assert sup.post(f"/api/v1/staff/users/{client_user.id}/block/", {"reason": "тест"}, format="json").status_code == 403
    old = auth_client(client_user)
    assert sup.post(f"/api/v1/staff/users/{client_user.id}/logout/").status_code == 200
    assert old.get("/api/v1/auth/me/").status_code == 401

    actions = list(AuditLog.objects.order_by("id").values_list("action", "actor_alias", "target_id"))
    assert ("user.block", "staff-moderator", str(client_user.id)) in actions
    assert ("user.unblock", "staff-moderator", str(client_user.id)) in actions
    assert ("user.force_logout", "staff-support", str(client_user.id)) in actions
    entry = AuditLog.objects.get(action="user.block")
    assert entry.details == {"reason": "Спам в чатах"} and entry.actor_role == "moderator" and entry.ip


@pytest.mark.django_db
def test_staff_cannot_act_on_equal_or_higher_staff(staff, admin_user):
    mod = auth_client(staff["moderator"])
    assert mod.post(f"/api/v1/staff/users/{staff['admin'].id}/block/", {"reason": "нет"}, format="json").status_code == 403
    assert mod.post(f"/api/v1/staff/users/{staff['moderator'].id}/block/", {"reason": "нет"}, format="json").status_code == 400
    adm = auth_client(staff["admin"])
    assert adm.post(f"/api/v1/staff/users/{admin_user.id}/block/", {"reason": "нет"}, format="json").status_code == 403
    assert adm.post(f"/api/v1/staff/users/{staff['support'].id}/logout/").status_code == 200


@pytest.mark.django_db
def test_user_list_hides_identity_from_non_owner(staff, admin_user, client_user, psychologist):
    rows = auth_client(staff["support"]).get("/api/v1/staff/users/?q=psy").json()["results"]
    for row in rows:
        assert "has_email" not in row and "email_hash" not in row and "email" not in row
    owner_rows = auth_client(admin_user).get("/api/v1/staff/users/?role=psychologist").json()["results"]
    assert owner_rows[0]["has_email"] is True and "email_hash" not in owner_rows[0]
    by_id = auth_client(staff["support"]).get(f"/api/v1/staff/users/?q={client_user.id}").json()
    assert by_id["count"] == 1 and by_id["results"][0]["alias"] == client_user.alias


# ── Специалисты и сессии ─────────────────────────────────────────────

@pytest.mark.django_db
def test_specialist_decisions_follow_matrix(staff, psychologist):
    pid = psychologist.id
    mod = auth_client(staff["moderator"])
    assert mod.post(f"/api/v1/staff/specialists/{pid}/decision/", {"decision": "suspend"}, format="json").status_code == 400
    resp = mod.post(f"/api/v1/staff/specialists/{pid}/decision/", {"decision": "suspend", "reason": "Жалобы клиентов"}, format="json")
    assert resp.status_code == 200 and resp.json()["verification_status"] == "suspended"
    assert mod.post(f"/api/v1/staff/specialists/{pid}/decision/", {"decision": "reinstate"}, format="json").status_code == 403
    assert mod.patch(f"/api/v1/staff/specialists/{pid}/", {"bio": "x"}, format="json").status_code == 403
    adm = auth_client(staff["admin"])
    assert adm.post(f"/api/v1/staff/specialists/{pid}/decision/", {"decision": "reinstate"}, format="json").status_code == 200
    before = adm.get(f"/api/v1/staff/specialists/{pid}/").json()["hourly_rate_rub"]
    resp = adm.patch(f"/api/v1/staff/specialists/{pid}/", {"hourly_rate_rub": 6000, "bio": "Новое"}, format="json")
    assert resp.status_code == 200 and resp.json()["hourly_rate_rub"] == 6000
    assert resp.json()["session_rate_rub"] != 3000
    detail = adm.get(f"/api/v1/staff/specialists/{pid}/").json()
    assert set(detail["documents"]) == {"full_name", "diploma", "phone", "photo"}
    actions = list(AuditLog.objects.order_by("id").values_list("action", flat=True))
    assert actions == ["specialist.suspend", "specialist.reinstate", "specialist.edit"]
    edit = AuditLog.objects.get(action="specialist.edit")
    assert edit.details["fields"]["hourly_rate_rub"] == {"from": before, "to": 6000}


@pytest.mark.django_db
def test_session_cancel_and_refund(staff, session):
    sup = auth_client(staff["support"])
    assert sup.post(f"/api/v1/staff/sessions/{session.id}/cancel/", {"reason": "Просьба клиента", "refund": True}, format="json").status_code == 403
    resp = sup.post(f"/api/v1/staff/sessions/{session.id}/cancel/", {"reason": "Просьба клиента"}, format="json")
    assert resp.status_code == 200 and resp.json()["status"] == "cancelled"
    assert "payout_rub" not in resp.json()
    adm = auth_client(staff["admin"])
    resp = adm.post(f"/api/v1/staff/sessions/{session.id}/cancel/", {"reason": "Возврат", "refund": True}, format="json")
    assert resp.status_code == 200 and resp.json()["status"] == "refunded"
    assert adm.post(f"/api/v1/staff/sessions/{session.id}/cancel/", {"reason": "Ещё раз"}, format="json").status_code == 400
    assert list(AuditLog.objects.order_by("id").values_list("action", flat=True)) == ["session.cancel", "session.refund"]
    detail = adm.get(f"/api/v1/staff/sessions/{session.id}/").json()
    assert any(e["meta"].get("cancelled_by") == "staff" for e in detail["events"])


# ── Жалобы ───────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_reports_flow(staff, session, client_user, psychologist):
    c = auth_client(client_user)
    resp = c.post("/api/v1/reports/", {"target_type": "session", "target_id": str(session.id),
                                       "reason": "unprofessional", "comment": "Опоздал на 20 минут"}, format="json")
    assert resp.status_code == 201
    rid = resp.json()["id"]
    again = c.post("/api/v1/reports/", {"target_type": "session", "target_id": str(session.id),
                                        "reason": "unprofessional"}, format="json")
    assert again.status_code == 200 and again.json()["id"] == rid
    assert c.post("/api/v1/reports/", {"target_type": "user", "target_id": client_user.alias,
                                       "reason": "spam"}, format="json").status_code == 400
    stranger = User.objects.create_anonymous_client("strangerpass1")
    assert auth_client(stranger).post("/api/v1/reports/", {
        "target_type": "session", "target_id": str(session.id), "reason": "spam"}, format="json").status_code == 404
    assert [r["id"] for r in c.get("/api/v1/reports/mine/").json()] == [rid]

    report = Report.objects.get(pk=rid)
    assert report.target_user == psychologist.user

    assert auth_client(staff["support"]).get("/api/v1/staff/reports/").status_code == 403
    mod = auth_client(staff["moderator"])
    listing = mod.get("/api/v1/staff/reports/").json()
    assert listing["count"] == 1 and listing["results"][0]["target"]["specialist"]["id"] == psychologist.id
    assert mod.post(f"/api/v1/staff/reports/{rid}/assign/").json()["status"] == "in_review"
    # Модератор не может отменять сессии → действие отклоняется целиком
    resp = mod.post(f"/api/v1/staff/reports/{rid}/resolve/", {
        "status": "resolved", "action": "cancel_session", "note": "Отменяем"}, format="json")
    assert resp.status_code == 403
    assert Report.objects.get(pk=rid).status == "in_review"
    resp = mod.post(f"/api/v1/staff/reports/{rid}/resolve/", {
        "status": "resolved", "action": "suspend_specialist", "note": "Повторные опоздания"}, format="json")
    assert resp.status_code == 200 and resp.json()["status"] == "resolved"
    psychologist.refresh_from_db()
    assert psychologist.verification_status == "suspended"
    actions = list(AuditLog.objects.order_by("id").values_list("action", flat=True))
    assert actions == ["report.assign", "specialist.suspend", "report.resolved"]


# ── Персонал и журнал ────────────────────────────────────────────────

@pytest.mark.django_db
def test_staff_invite_one_time_password_and_roles(staff, admin_user, api):
    adm = auth_client(staff["admin"])
    assert adm.post("/api/v1/staff/members/", {"login": "new-admin", "role": "admin"}, format="json").status_code == 403
    assert adm.post("/api/v1/staff/members/", {"login": "Bad Login!", "role": "support"}, format="json").status_code == 400
    resp = adm.post("/api/v1/staff/members/", {"login": "olga.support", "role": "support"}, format="json")
    assert resp.status_code == 201
    otp_password = resp.json()["one_time_password"]
    new_user = User.objects.get(alias="olga.support")
    assert get_staff_role(new_user) == "support" and new_user.role == "admin"

    login = api.post("/api/v1/auth/login/", {"login": "olga.support", "password": otp_password}, format="json")
    assert login.status_code == 200
    c = auth_client(new_user)
    assert c.get("/api/v1/staff/me/").json()["must_change_password"] is True
    denied = c.get("/api/v1/staff/users/")
    assert denied.status_code == 403 and denied.json()["code"] == "password_change_required"
    resp = c.post("/api/v1/staff/me/password/", {"old_password": otp_password, "new_password": "brand-new-pass-1"}, format="json")
    assert resp.status_code == 200 and resp.json()["access"]
    assert auth_client(User.objects.get(pk=new_user.pk)).get("/api/v1/staff/users/").status_code == 200

    uid = str(new_user.id)
    assert adm.patch(f"/api/v1/staff/members/{uid}/", {"role": "owner"}, format="json").status_code == 403
    assert adm.patch(f"/api/v1/staff/members/{uid}/", {"role": "moderator"}, format="json").json()["role"] == "moderator"
    assert adm.post(f"/api/v1/staff/members/{admin_user.id}/deactivate/").status_code == 403
    assert adm.post(f"/api/v1/staff/members/{staff['admin'].id}/deactivate/").status_code == 403
    assert adm.post(f"/api/v1/staff/members/{uid}/deactivate/").status_code == 200
    assert get_staff_role(User.objects.get(pk=new_user.pk)) is None
    assert auth_client(User.objects.get(pk=new_user.pk)).get("/api/v1/staff/me/").status_code == 401
    reset = adm.post(f"/api/v1/staff/members/{uid}/reset-password/").json()
    assert reset["one_time_password"] and reset["member"]["must_change_password"]

    owner = auth_client(admin_user)
    assert owner.post("/api/v1/staff/members/", {"login": "second-admin", "role": "admin"}, format="json").status_code == 201
    members = owner.get("/api/v1/staff/members/").json()
    assert members["results"][0]["role"] == "owner"
    assert {r["value"] for r in members["roles"] if r["manageable"]} == {"admin", "moderator", "support", "developer", "editor"}

    actions = set(AuditLog.objects.values_list("action", flat=True))
    assert {"staff.create", "staff.update", "staff.deactivate", "staff.reset_password",
            "staff.me.password_changed"} <= actions


@pytest.mark.django_db
def test_audit_log_is_read_only(staff, client_user):
    auth_client(staff["moderator"]).post(f"/api/v1/staff/users/{client_user.id}/logout/")
    entry = AuditLog.objects.get()
    entry.action = "tampered"
    with pytest.raises(PermissionError):
        entry.save()
    with pytest.raises(PermissionError):
        entry.delete()
    with pytest.raises(PermissionError):
        AuditLog.objects.all().delete()
    with pytest.raises(PermissionError):
        AuditLog.objects.update(action="x")
    dev = auth_client(staff["developer"])
    listing = dev.get("/api/v1/staff/audit/?category=user").json()
    assert listing["count"] == 1 and listing["results"][0]["actor"]["alias"] == "staff-moderator"
    for method in ("post", "patch", "delete"):
        assert getattr(dev, method)("/api/v1/staff/audit/").status_code == 405


# ── 2FA ─────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_totp_setup_login_and_replay(admin_user, api, settings):
    c = auth_client(admin_user)
    setup = c.post("/api/v1/staff/me/2fa/setup/").json()
    secret = setup["secret"]
    assert setup["otpauth_url"].startswith("otpauth://totp/")
    assert c.post("/api/v1/staff/me/2fa/enable/", {"code": "000000"}, format="json").status_code == 400
    code = totp.code_at(secret)
    assert c.post("/api/v1/staff/me/2fa/enable/", {"code": code}, format="json").status_code == 200
    member = StaffMember.objects.get(user=admin_user)
    assert member.totp_enabled and secret not in member.totp_secret_encrypted

    creds = {"login": "admin", "password": "adminpass12345"}
    first = api.post("/api/v1/auth/login/", creds, format="json")
    assert first.status_code == 400 and first.json()["otp_required"] is True
    # Тот же код повторно не принимается (защита от повтора)
    assert api.post("/api/v1/auth/login/", {**creds, "otp": code}, format="json").status_code == 400
    import time
    next_code = totp.code_at(secret, time.time() + 30)
    ok = api.post("/api/v1/auth/login/", {**creds, "otp": next_code}, format="json")
    assert ok.status_code == 200 and ok.json()["access"]
    assert AuditLog.objects.filter(action="auth.staff_login_failed").exists()
    assert AuditLog.objects.filter(action="auth.staff_login", details__second_factor=True).exists()


@pytest.mark.django_db
def test_required_2fa_blocks_owner_until_enabled(admin_user, staff, settings):
    settings.STAFF_REQUIRE_2FA = True
    c = auth_client(admin_user)
    denied = c.get("/api/v1/staff/dashboard/")
    assert denied.status_code == 403 and denied.json()["code"] == "totp_setup_required"
    assert c.get("/api/v1/staff/me/").json()["totp_required"] is True
    # Роли без обязательного 2FA работают
    assert auth_client(staff["support"]).get("/api/v1/staff/dashboard/").status_code == 200
    secret = c.post("/api/v1/staff/me/2fa/setup/").json()["secret"]
    c.post("/api/v1/staff/me/2fa/enable/", {"code": totp.code_at(secret)}, format="json")
    assert c.get("/api/v1/staff/dashboard/").status_code == 200
    assert c.post("/api/v1/staff/me/2fa/disable/", {"code": totp.code_at(secret)}, format="json").status_code == 400


def test_totp_matches_rfc6238_vector():
    # RFC 6238, SHA-1, T=59 → 94287082 (8 цифр) → последние 6: 287082
    secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
    assert totp.code_at(secret, 59) == "287082"
    assert totp.verify(secret, "287082", now=59) == 1
    assert totp.verify(secret, "287082", now=59, last_step=1) is None


@pytest.mark.django_db
def test_system_status_for_developer(staff):
    data = auth_client(staff["developer"]).get("/api/v1/staff/system/").json()
    assert data["health"]["db"]["status"] == "ok"
    assert data["health"]["cache"]["status"] == "ok"
    assert data["health"]["channels"]["status"] == "ok"
    assert data["migrations"]["pending_count"] == 0
    assert "commit" in data["version"] and data["errors"]["total"] >= 0
