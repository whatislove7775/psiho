"""G2: документы специалистов (проверка персоналом, приватные файлы) и отзывы (только после созвона)."""
from datetime import timedelta
from io import BytesIO

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from PIL import Image

from apps.credentials.models import Credential, CredentialFile
from apps.reviews.models import Review
from apps.sessions.models import ConsultationSession
from apps.staff.models import AuditLog, Report, StaffMember
from apps.users.models import PsychologistProfile, User

from .conftest import auth_client

CAB = "/api/v1/psychologist/credentials/"


def make_staff(role):
    user = User.objects.create_user(alias=f"staff-{role}", password="staffpass12345", role="admin")
    StaffMember.objects.create(user=user, role=role)
    return user


def jpeg_with_exif():
    img = Image.new("RGB", (800, 600), (120, 160, 200))
    ex = Image.Exif()
    ex[0x010F] = "SecretCam"
    ex[0x8825] = {1: "N"}  # GPS IFD
    buf = BytesIO()
    img.save(buf, format="JPEG", exif=ex.tobytes())
    return SimpleUploadedFile("diploma.jpg", buf.getvalue(), content_type="image/jpeg")


def pdf_file(name="diploma.pdf"):
    return SimpleUploadedFile(name, b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF", content_type="application/pdf")


def create_item(psychologist, **extra):
    api = auth_client(psychologist.user)
    body = {"kind": "diploma", "title": "Клиническая психология", "issuer": "МГУ", "year": 2015,
            "number": "ВСА 0123456", **extra}
    res = api.post(CAB, body, format="json")
    assert res.status_code == 201, res.data
    return res.data


# ── Документы ────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_specialist_creates_item_and_uploads_files(psychologist):
    item = create_item(psychologist)
    assert item["status"] == "pending"
    assert item["number"] == "ВСА 0123456"
    api = auth_client(psychologist.user)
    res = api.post(f"{CAB}{item['id']}/files/", {"file": jpeg_with_exif(), "is_public": "1"}, format="multipart")
    assert res.status_code == 201, res.data
    assert res.data["mime"] == "image/jpeg" and res.data["is_public"] is True
    f = CredentialFile.objects.get(pk=res.data["id"])
    # На диске/в БД — только шифр
    assert b"JFIF" not in bytes(f.data_enc) and b"\xff\xd8" not in bytes(f.data_enc)[:4]
    # Владелец скачивает: EXIF вычищен
    body = api.get(f"/api/v1/credentials/files/{f.id}/")
    assert body.status_code == 200
    content = b"".join(body) if hasattr(body, "streaming_content") else body.content
    assert b"SecretCam" not in content
    assert not Image.open(BytesIO(content)).getexif()
    res = api.post(f"{CAB}{item['id']}/files/", {"file": pdf_file()}, format="multipart")
    assert res.status_code == 201 and res.data["kind"] == "pdf" and res.data["is_public"] is False


@pytest.mark.django_db
def test_rejects_bad_files(psychologist):
    item = create_item(psychologist)
    api = auth_client(psychologist.user)
    gif = BytesIO()
    Image.new("RGB", (50, 50)).save(gif, format="GIF")
    res = api.post(f"{CAB}{item['id']}/files/", {"file": SimpleUploadedFile("a.gif", gif.getvalue())}, format="multipart")
    assert res.status_code == 400
    big = SimpleUploadedFile("big.pdf", b"%PDF-" + b"0" * (10 * 1024 * 1024 + 1))
    res = api.post(f"{CAB}{item['id']}/files/", {"file": big}, format="multipart")
    assert res.status_code == 400


@pytest.mark.django_db
def test_validation_per_kind(psychologist):
    api = auth_client(psychologist.user)
    assert api.post(CAB, {"kind": "supervision", "title": "Супервизия КПТ"}, format="json").status_code == 400
    res = api.post(CAB, {"kind": "supervision", "title": "Супервизия КПТ", "supervisor": "И. Иванов",
                         "hours": 40, "year": 2020, "year_end": 2022}, format="json")
    assert res.status_code == 201
    res = api.post(CAB, {"kind": "publication", "title": "Тревога у подростков", "issuer": "Вопросы психологии",
                         "year": 2021, "doi": "https://doi.org/10.1000/xyz"}, format="json")
    assert res.status_code == 201 and res.data["doi"] == "10.1000/xyz"


@pytest.mark.django_db
def test_private_files_are_not_public(psychologist, client_user, api):
    item = create_item(psychologist)
    owner = auth_client(psychologist.user)
    private = owner.post(f"{CAB}{item['id']}/files/", {"file": pdf_file()}, format="multipart").data
    public = owner.post(f"{CAB}{item['id']}/files/", {"file": pdf_file("b.pdf"), "is_public": "1"},
                        format="multipart").data
    pk = psychologist.pk
    # До подтверждения ничего не видно публично
    assert api.get(f"/api/v1/psychologists/{pk}/credentials/").data == []
    assert api.get(f"/api/v1/psychologists/{pk}/credentials/files/{public['id']}/").status_code == 404
    # Сотрудник подтверждает
    admin = auth_client(make_staff("admin"))
    assert admin.post(f"/api/v1/staff/credentials/{item['id']}/", {"decision": "approve"}, format="json").status_code == 200
    listing = api.get(f"/api/v1/psychologists/{pk}/credentials/").data
    assert len(listing) == 1
    assert [f["id"] for f in listing[0]["files"]] == [public["id"]]
    assert "number" not in listing[0] and listing[0]["number_masked"] == "№ •••• 3456"
    assert api.get(f"/api/v1/psychologists/{pk}/credentials/files/{public['id']}/").status_code == 200
    assert api.get(f"/api/v1/psychologists/{pk}/credentials/files/{private['id']}/").status_code == 404
    # Авторизованный эндпоинт: ни аноним, ни клиент, ни другой специалист не получают приватный файл
    assert api.get(f"/api/v1/credentials/files/{private['id']}/").status_code == 401
    assert auth_client(client_user).get(f"/api/v1/credentials/files/{private['id']}/").status_code == 404
    other = User.objects.create_psychologist(email="o@example.com", password="otherpass123")
    PsychologistProfile.objects.create(user=other, display_name="Другой", session_rate_rub=1000)
    assert auth_client(other).get(f"/api/v1/credentials/files/{private['id']}/").status_code == 404
    # Модератор (без specialists.verify) — тоже нет; админ — да
    assert auth_client(make_staff("moderator")).get(f"/api/v1/credentials/files/{private['id']}/").status_code == 404
    assert admin.get(f"/api/v1/credentials/files/{private['id']}/").status_code == 200
    # Другой специалист не может править чужой пункт
    assert auth_client(other).patch(f"{CAB}{item['id']}/", {"title": "Взлом"}, format="json").status_code == 404


@pytest.mark.django_db
def test_staff_queue_permissions_and_audit(psychologist):
    item = create_item(psychologist)
    for role in ("moderator", "support", "editor", "developer"):
        c = auth_client(make_staff(role))
        assert c.get("/api/v1/staff/credentials/").status_code == 403
        assert c.post(f"/api/v1/staff/credentials/{item['id']}/", {"decision": "approve"}, format="json").status_code == 403
    assert auth_client(psychologist.user).get("/api/v1/staff/credentials/").status_code == 403
    admin = auth_client(make_staff("admin"))
    q = admin.get("/api/v1/staff/credentials/?status=pending").data
    assert q["count"] == 1 and q["counts"]["pending"] == 1
    assert q["results"][0]["number"] == "ВСА 0123456"
    # Причина обязательна
    assert admin.post(f"/api/v1/staff/credentials/{item['id']}/", {"decision": "request_info"}, format="json").status_code == 400
    res = admin.post(f"/api/v1/staff/credentials/{item['id']}/",
                     {"decision": "request_info", "comment": "Приложите вкладыш к диплому"}, format="json")
    assert res.status_code == 200 and res.data["status"] == "needs_info"
    assert AuditLog.objects.filter(action="credential.request_info", target_id=item["id"]).exists()
    # Специалист отвечает — пункт снова на проверке, переписка видна
    owner = auth_client(psychologist.user)
    res = owner.post(f"{CAB}{item['id']}/notes/", {"text": "Приложила"}, format="json")
    assert res.status_code == 201 and res.data["status"] == "pending"
    assert [n["author_role"] for n in res.data["notes"]] == ["staff", "specialist"]
    res = admin.post(f"/api/v1/staff/credentials/{item['id']}/", {"decision": "reject", "comment": "Нечитаемо"}, format="json")
    assert res.data["status"] == "rejected" and res.data["reject_reason"] == "Нечитаемо"
    assert AuditLog.objects.filter(action="credential.reject").count() == 1


@pytest.mark.django_db
def test_edit_after_approval_requires_reverification(psychologist, api):
    item = create_item(psychologist)
    admin = auth_client(make_staff("admin"))
    admin.post(f"/api/v1/staff/credentials/{item['id']}/", {"decision": "approve"}, format="json")
    detail = api.get(f"/api/v1/psychologists/{psychologist.pk}/")
    assert detail.data["verified_credentials"] == 1
    owner = auth_client(psychologist.user)
    # Правка без изменений — статус тот же
    res = owner.patch(f"{CAB}{item['id']}/", {"title": "Клиническая психология"}, format="json")
    assert res.data["status"] == "approved"
    res = owner.patch(f"{CAB}{item['id']}/", {"year": 2016}, format="json")
    assert res.data["status"] == "pending" and res.data["was_approved"] is True
    assert api.get(f"/api/v1/psychologists/{psychologist.pk}/credentials/").data == []
    assert api.get(f"/api/v1/psychologists/{psychologist.pk}/").data["verified_credentials"] == 0
    # Сделать файл публичным после подтверждения — тоже повторная проверка
    admin.post(f"/api/v1/staff/credentials/{item['id']}/", {"decision": "approve"}, format="json")
    f = owner.post(f"{CAB}{item['id']}/files/", {"file": pdf_file()}, format="multipart").data
    assert Credential.objects.get(pk=item["id"]).status == "pending"
    admin.post(f"/api/v1/staff/credentials/{item['id']}/", {"decision": "approve"}, format="json")
    owner.patch(f"{CAB}files/{f['id']}/", {"is_public": True}, format="json")
    assert Credential.objects.get(pk=item["id"]).status == "pending"


# ── Отзывы ───────────────────────────────────────────────────────────

def completed_call(client, profile, days_ago=2):
    return ConsultationSession.objects.create(
        client=client, psychologist_profile=profile, status="completed",
        scheduled_at=timezone.now() - timedelta(days=days_ago), duration_minutes=50, amount_kopecks=300000,
        completed_at=timezone.now() - timedelta(days=days_ago),
    )


@pytest.mark.django_db
def test_only_clients_with_completed_calls_can_review(psychologist, client_user):
    c = auth_client(client_user)
    body = {"psychologist": psychologist.pk, "rating": 5, "text": "Спасибо", "tags": ["attentive"]}
    res = c.post("/api/v1/reviews/", body, format="json")
    assert res.status_code == 403 and res.data["code"] == "no_completed_calls"
    assert c.get(f"/api/v1/reviews/eligibility/?psychologist={psychologist.pk}").data["can_review"] is False
    # Оплаченный, но не проведённый созвон не считается
    ConsultationSession.objects.create(
        client=client_user, psychologist_profile=psychologist, status="paid",
        scheduled_at=timezone.now() + timedelta(days=1), duration_minutes=50, amount_kopecks=300000)
    assert c.post("/api/v1/reviews/", body, format="json").status_code == 403
    completed_call(client_user, psychologist)
    assert c.get(f"/api/v1/reviews/eligibility/?psychologist={psychologist.pk}").data["can_review"] is True
    res = c.post("/api/v1/reviews/", body, format="json")
    assert res.status_code == 201, res.data
    # Специалист не может оставить отзыв
    assert auth_client(psychologist.user).post("/api/v1/reviews/", body, format="json").status_code == 403


@pytest.mark.django_db
def test_refunded_call_does_not_count(psychologist, client_user):
    from apps.billing.models import Hold

    s = completed_call(client_user, psychologist)
    Hold.objects.create(session=s, session_ref=s.id, client=client_user, status="refunded", amount_kopecks=300000)
    res = auth_client(client_user).post("/api/v1/reviews/", {"psychologist": psychologist.pk, "rating": 1}, format="json")
    assert res.status_code == 403


@pytest.mark.django_db
def test_one_review_per_client_editable_anonymous(psychologist, client_user, api):
    completed_call(client_user, psychologist, 3)
    completed_call(client_user, psychologist, 10)
    c = auth_client(client_user)
    assert c.post("/api/v1/reviews/", {"psychologist": psychologist.pk, "rating": 4}, format="json").status_code == 201
    res = c.post("/api/v1/reviews/", {"psychologist": psychologist.pk, "rating": 5, "text": "Лучше",
                                      "tags": ["clarity", "clarity"]}, format="json")
    assert res.status_code == 200 and res.data["edited"] is True and [t["key"] for t in res.data["tags"]] == ["clarity"]
    assert Review.objects.count() == 1
    rid = res.data["id"]
    assert c.patch(f"/api/v1/reviews/{rid}/", {"rating": 3}, format="json").data["rating"] == 3
    assert c.post("/api/v1/reviews/", {"psychologist": psychologist.pk, "rating": 5, "tags": ["nope"]},
                  format="json").status_code == 400
    pub = api.get(f"/api/v1/psychologists/{psychologist.pk}/reviews/").data
    assert pub["summary"]["count"] == 1 and pub["summary"]["rating"] == 3.0
    assert pub["summary"]["distribution"]["3"] == 1
    row = pub["results"][0]
    assert row["author_label"] == "Клиент, 2 созвона"
    raw = str(pub)
    assert client_user.alias not in raw and str(client_user.id) not in raw
    card = api.get(f"/api/v1/psychologists/{psychologist.pk}/").data
    assert card["rating"] == 3.0 and card["reviews_count"] == 1
    listing = api.get("/api/v1/psychologists/").data
    assert listing[0]["rating"] == 3.0
    # Чужой отзыв править нельзя
    other = User.objects.create_anonymous_client("otherpass123")
    assert auth_client(other).patch(f"/api/v1/reviews/{rid}/", {"rating": 1}, format="json").status_code == 404


@pytest.mark.django_db
def test_specialist_reply_once(psychologist, client_user, api):
    completed_call(client_user, psychologist)
    rid = auth_client(client_user).post("/api/v1/reviews/", {"psychologist": psychologist.pk, "rating": 5},
                                        format="json").data["id"]
    pro = auth_client(psychologist.user)
    assert pro.get("/api/v1/reviews/about-me/").data["summary"]["count"] == 1
    assert pro.post(f"/api/v1/reviews/{rid}/reply/", {"text": "Спасибо!"}, format="json").status_code == 200
    assert pro.post(f"/api/v1/reviews/{rid}/reply/", {"text": "Спасибо большое!"}, format="json").status_code == 200
    r = Review.objects.get(pk=rid)
    assert r.reply_text == "Спасибо большое!"
    assert api.get(f"/api/v1/psychologists/{psychologist.pk}/reviews/").data["results"][0]["reply"]["text"] == "Спасибо большое!"
    other = User.objects.create_psychologist(email="o2@example.com", password="otherpass123")
    PsychologistProfile.objects.create(user=other, display_name="Другой", session_rate_rub=1000)
    assert auth_client(other).post(f"/api/v1/reviews/{rid}/reply/", {"text": "Хм"}, format="json").status_code == 404


@pytest.mark.django_db
def test_report_and_moderate_review(psychologist, client_user, api):
    completed_call(client_user, psychologist)
    rid = auth_client(client_user).post("/api/v1/reviews/", {"psychologist": psychologist.pk, "rating": 1,
                                                             "text": "Плохо"}, format="json").data["id"]
    pro = auth_client(psychologist.user)
    res = pro.post("/api/v1/reports/", {"target_type": "review", "target_id": str(rid), "reason": "abuse",
                                        "comment": "Оскорбление"}, format="json")
    assert res.status_code == 201, res.data
    assert Report.objects.get().target_message_id == str(rid)
    assert auth_client(make_staff("support")).get("/api/v1/staff/reviews/").status_code == 403
    mod = auth_client(make_staff("moderator"))
    q = mod.get("/api/v1/staff/reviews/?status=reported").data
    assert q["count"] == 1 and q["results"][0]["reports"][0]["reason"] == "abuse"
    assert mod.post(f"/api/v1/staff/reviews/{rid}/moderate/", {"action": "hide"}, format="json").status_code == 400
    res = mod.post(f"/api/v1/staff/reviews/{rid}/moderate/", {"action": "hide", "note": "Оскорбления"}, format="json")
    assert res.status_code == 200 and res.data["status"] == "hidden"
    assert Report.objects.get().status == "resolved"
    assert AuditLog.objects.filter(action="review.hide").exists()
    pub = api.get(f"/api/v1/psychologists/{psychologist.pk}/reviews/").data
    assert pub["summary"]["count"] == 0 and pub["results"] == []
    assert api.get(f"/api/v1/psychologists/{psychologist.pk}/").data["rating"] is None
    mod.post(f"/api/v1/staff/reviews/{rid}/moderate/", {"action": "restore"}, format="json")
    assert api.get(f"/api/v1/psychologists/{psychologist.pk}/reviews/").data["summary"]["count"] == 1


@pytest.mark.django_db
def test_nav_badge_counts_pending_credentials(psychologist):
    create_item(psychologist)
    me = auth_client(make_staff("admin")).get("/api/v1/staff/me/").data
    assert me["badges"]["credentials"] == 1
    me = auth_client(make_staff("moderator")).get("/api/v1/staff/me/").data
    assert "credentials" not in me["badges"]
