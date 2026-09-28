"""L1: статьи специалистов (модерация, лента, «В топе») и загрузка обложек."""
from io import BytesIO

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from apps.content.models import Article, ArticleCover
from apps.staff.models import AuditLog, StaffMember
from apps.users.models import PsychologistProfile, User

from .conftest import auth_client

BODY = " ".join(["Слово"] * 200)


@pytest.fixture(autouse=True)
def _media(settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    return tmp_path


def _staff(role):
    user = User.objects.create_user(alias=f"staff-{role}", password="staffpass12345", role="admin")
    StaffMember.objects.create(user=user, role=role)
    return auth_client(user)


def _img(w, h, fmt="JPEG", exif=False):
    buf = BytesIO()
    img = Image.new("RGB", (w, h), (120, 160, 220))
    kwargs = {}
    if exif:
        ex = Image.Exif()
        ex[0x010F] = "SecretCam"  # Make
        kwargs["exif"] = ex.tobytes()
    img.save(buf, format=fmt, **kwargs)
    return SimpleUploadedFile(f"c.{fmt.lower()}", buf.getvalue(), content_type=f"image/{fmt.lower()}")


def _draft(psy_client, **extra):
    data = {"title": "Как пережить тревожную ночь", "summary": "Коротко о том, что помогает, когда не спится от тревоги.",
            "body": BODY, "topic": "anxiety", **extra}
    r = psy_client.post("/api/v1/content/my/articles/", data, format="json")
    assert r.status_code == 201, r.content
    return r.json()


@pytest.mark.django_db
def test_specialist_article_full_moderation_flow(api, psychologist):
    psy = auth_client(psychologist.user)
    art = _draft(psy)
    assert art["status"] == "draft" and art["slug"].startswith("kak-perezhit") and not art["is_published"]

    # Черновик не виден ни публично, ни сотрудникам
    assert api.get(f"/api/v1/content/articles/{art['slug']}/").status_code == 404
    editor = _staff("editor")
    assert art["id"] not in [a["id"] for a in editor.get("/api/v1/content/manage/articles/?source=specialists").json()]

    r = psy.post(f"/api/v1/content/my/articles/{art['id']}/submit/")
    assert r.status_code == 200 and r.json()["status"] == "pending"
    # На модерации нельзя править
    assert psy.patch(f"/api/v1/content/my/articles/{art['id']}/", {"title": "Другое"}, format="json").status_code == 400
    queue = editor.get("/api/v1/content/manage/articles/?source=specialists").json()
    assert queue[0]["id"] == art["id"] and queue[0]["moderation"] == "pending"
    assert queue[0]["specialist"]["name"] == "Анна"
    assert api.get(f"/api/v1/content/articles/{art['slug']}/").status_code == 404

    # Отклонение требует комментарий
    assert editor.post(f"/api/v1/content/manage/articles/{art['id']}/moderate/", {"decision": "reject"},
                       format="json").status_code == 400
    r = editor.post(f"/api/v1/content/manage/articles/{art['id']}/moderate/",
                    {"decision": "reject", "comment": "Добавьте источники"}, format="json")
    assert r.status_code == 200 and r.json()["moderation"] == "rejected"
    mine = psy.get(f"/api/v1/content/my/articles/{art['id']}/").json()
    assert mine["status"] == "rejected" and mine["moderation_comment"] == "Добавьте источники"

    # Исправил и отправил снова → одобрено → в ленте с меткой специалиста
    assert psy.patch(f"/api/v1/content/my/articles/{art['id']}/", {
        "sources": [{"title": "WHO", "url": "https://www.who.int/"}]}, format="json").status_code == 200
    assert psy.post(f"/api/v1/content/my/articles/{art['id']}/submit/").status_code == 200
    r = editor.post(f"/api/v1/content/manage/articles/{art['id']}/moderate/", {"decision": "approve"}, format="json")
    assert r.status_code == 200 and r.json()["is_published"]
    assert AuditLog.objects.filter(action="content.article.approve").exists()

    feed = api.get("/api/v1/content/articles/?source=specialists").json()
    assert [a["slug"] for a in feed] == [art["slug"]]
    assert feed[0]["specialist"]["name"] == "Анна"
    detail = api.get(f"/api/v1/content/articles/{art['slug']}/").json()
    assert detail["specialist"]["bio"] == "Работаю с тревогой" and detail["author_name"] == "Анна"
    assert all(a["specialist"] is None for a in api.get("/api/v1/content/articles/?source=editorial").json())

    # Снять с публикации — пропадает из ленты
    assert psy.post(f"/api/v1/content/my/articles/{art['id']}/withdraw/").json()["status"] == "draft"
    assert api.get(f"/api/v1/content/articles/{art['slug']}/").status_code == 404


@pytest.mark.django_db
def test_specialist_permissions(api, psychologist, client_user):
    psy = auth_client(psychologist.user)
    art = _draft(psy)
    # Клиент и аноним не пишут статьи
    assert api.get("/api/v1/content/my/articles/").status_code == 401
    assert auth_client(client_user).post("/api/v1/content/my/articles/", {"title": "x"}, format="json").status_code == 403
    # Чужую статью не видно
    other_user = User.objects.create_psychologist(email="o@example.com", password="psypass12345")
    PsychologistProfile.objects.create(user=other_user, display_name="Олег", session_rate_rub=2000,
                                       verification_status="approved")
    other = auth_client(other_user)
    assert other.get(f"/api/v1/content/my/articles/{art['id']}/").status_code == 404
    assert other.post(f"/api/v1/content/my/articles/{art['id']}/submit/").status_code == 404
    # Специалист не может сам опубликовать или модерировать
    assert psy.patch(f"/api/v1/content/my/articles/{art['id']}/", {"is_published": True, "moderation": "approved"},
                     format="json").status_code == 200
    assert Article.objects.get(pk=art["id"]).is_published is False
    psy.post(f"/api/v1/content/my/articles/{art['id']}/submit/")
    assert psy.post(f"/api/v1/content/manage/articles/{art['id']}/moderate/", {"decision": "approve"},
                    format="json").status_code == 403
    # Поддержка не модерирует; редактор — да
    assert _staff("support").post(f"/api/v1/content/manage/articles/{art['id']}/moderate/",
                                  {"decision": "approve"}, format="json").status_code == 403
    # Непроверенный специалист не может отправить на модерацию
    psychologist.verification_status = "pending"
    psychologist.save()
    art2 = _draft(psy, title="Ещё одна статья о сне")
    assert psy.post(f"/api/v1/content/my/articles/{art2['id']}/submit/").status_code == 403


@pytest.mark.django_db
def test_short_article_cannot_be_submitted(psychologist):
    psy = auth_client(psychologist.user)
    art = _draft(psy, body="Коротко.")
    r = psy.post(f"/api/v1/content/my/articles/{art['id']}/submit/")
    assert r.status_code == 400 and "content" in r.json()


@pytest.mark.django_db
def test_public_feed_only_published_and_approved_authors(api, psychologist):
    psy = auth_client(psychologist.user)
    editor = _staff("editor")
    art = _draft(psy)
    psy.post(f"/api/v1/content/my/articles/{art['id']}/submit/")
    editor.post(f"/api/v1/content/manage/articles/{art['id']}/moderate/", {"decision": "approve"}, format="json")
    assert art["slug"] in [a["slug"] for a in api.get("/api/v1/content/articles/").json()]
    # Специалиста приостановили — его статьи уходят из ленты
    psychologist.verification_status = "suspended"
    psychologist.save()
    assert art["slug"] not in [a["slug"] for a in api.get("/api/v1/content/articles/").json()]
    assert api.get(f"/api/v1/content/articles/{art['slug']}/").status_code == 404
    psychologist.verification_status = "approved"
    psychologist.save()
    # Сотрудник включил публикацию в обход модерации — статья с moderation=pending всё равно не видна
    a2 = _draft(psy, title="Статья в обход модерации")
    psy.post(f"/api/v1/content/my/articles/{a2['id']}/submit/")
    Article.objects.filter(pk=a2["id"]).update(is_published=True)
    assert api.get(f"/api/v1/content/articles/{a2['slug']}/").status_code == 404


@pytest.mark.django_db
def test_featured_and_top_ranking(api, psychologist):
    editor = _staff("editor")
    slugs = [a["slug"] for a in api.get("/api/v1/content/articles/").json()]
    last = Article.objects.get(slug=slugs[-1])
    r = editor.post(f"/api/v1/content/manage/articles/{last.pk}/feature/", {"featured": True}, format="json")
    assert r.status_code == 200 and r.json()["is_featured"]
    feed = api.get("/api/v1/content/articles/").json()
    assert feed[0]["slug"] == last.slug and feed[0]["is_featured"]
    assert _staff("support").post(f"/api/v1/content/manage/articles/{last.pk}/feature/", {"featured": False},
                                  format="json").status_code == 403
    # Прочтения поднимают статью в сортировке «топ»
    other = Article.objects.get(slug=slugs[0])
    assert api.post(f"/api/v1/content/articles/{other.slug}/read/").status_code == 204
    Article.objects.filter(pk=other.pk).update(reads=500)
    top = api.get("/api/v1/content/articles/?sort=top").json()
    assert top[0]["slug"] == last.slug and top[1]["slug"] == other.slug


@pytest.mark.django_db
def test_cover_upload_crop_variants_and_exif(psychologist, client_user, _media):
    psy = auth_client(psychologist.user)
    assert auth_client(client_user).post("/api/v1/content/covers/", {"image": _img(1600, 900)},
                                         format="multipart").status_code == 403
    r = psy.post("/api/v1/content/covers/", {"image": _img(2000, 2000, exif=True),
                                             "crop": '{"x": 0.1, "y": 0.2, "w": 0.8}'}, format="multipart")
    assert r.status_code == 201, r.content
    cover = r.json()
    assert (cover["width"], cover["height"]) == (1600, 900)
    for key, size in (("url", (1600, 900)), ("md", (800, 450)), ("sm", (480, 270))):
        img = Image.open(_media / cover[key].removeprefix("/media/"))
        assert img.format == "WEBP" and img.size == size
        assert not img.getexif()
    # Слишком маленький кадр
    r = psy.post("/api/v1/content/covers/", {"image": _img(500, 300)}, format="multipart")
    assert r.status_code == 400

    art = _draft(psy, cover_image_id=cover["id"])
    assert art["cover_image"]["md"] == cover["md"]
    # Чужую обложку прикрепить нельзя
    editor_user = User.objects.create_user(alias="ed", password="staffpass12345", role="admin")
    StaffMember.objects.create(user=editor_user, role="editor")
    staff_cover = auth_client(editor_user).post("/api/v1/content/covers/", {"image": _img(1600, 900, "PNG")},
                                                format="multipart").json()
    assert psy.patch(f"/api/v1/content/my/articles/{art['id']}/", {"cover_image_id": staff_cover["id"]},
                     format="json").status_code == 400
    # Убрать обложку → файлы удаляются
    assert psy.patch(f"/api/v1/content/my/articles/{art['id']}/", {"cover_image_id": None},
                     format="json").json()["cover_image"] is None
    assert not ArticleCover.objects.filter(pk=cover["id"]).exists()
    assert not (_media / cover["url"].removeprefix("/media/")).exists()
