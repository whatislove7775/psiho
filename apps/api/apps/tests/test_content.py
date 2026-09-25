import pytest

from apps.content.models import Article, Practice
from apps.content.seed_articles import ARTICLES
from apps.content.seed_practices import PRACTICES

from .conftest import auth_client


@pytest.mark.django_db
def test_seeded_content_is_public(api):
    # The data migration seeds starter content
    resp = api.get("/api/v1/content/articles/")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == len(ARTICLES) >= 12
    assert "body" not in items[0] and items[0]["topic_label"]

    detail = api.get(f"/api/v1/content/articles/{items[0]['slug']}/").json()
    assert detail["body"].strip() and detail["title"] == items[0]["title"]

    practices = api.get("/api/v1/content/practices/").json()
    assert len(practices) == len(PRACTICES) >= 8
    p = api.get("/api/v1/content/practices/dyhanie-4-6/").json()
    assert p["pattern"]["exhale"] == 6 and p["steps"]


@pytest.mark.django_db
def test_topic_filter_limit_and_exclude(api):
    anxiety = api.get("/api/v1/content/articles/?topic=anxiety").json()
    assert anxiety and all(a["topic"] == "anxiety" for a in anxiety)
    assert len(api.get("/api/v1/content/articles/?limit=3").json()) == 3
    slug = anxiety[0]["slug"]
    others = api.get(f"/api/v1/content/articles/?topic=anxiety&exclude={slug}").json()
    assert slug not in [a["slug"] for a in others]
    topics = api.get("/api/v1/content/topics/").json()
    assert {"value": "anxiety", "label": "Тревога", "count": len(anxiety)} in topics


@pytest.mark.django_db
def test_drafts_are_hidden(api):
    Article.objects.create(title="Черновик", slug="draft", body="x", is_published=False)
    Practice.objects.create(title="Черновик", slug="draft-p", is_published=False)
    assert api.get("/api/v1/content/articles/draft/").status_code == 404
    assert api.get("/api/v1/content/practices/draft-p/").status_code == 404
    assert "draft" not in [a["slug"] for a in api.get("/api/v1/content/articles/").json()]


@pytest.mark.django_db
def test_write_api_is_staff_only(api, client_user, psychologist):
    body = {"title": "Новая", "slug": "novaya", "body": "Текст"}
    assert api.post("/api/v1/content/manage/articles/", body, format="json").status_code == 401
    assert auth_client(client_user).post("/api/v1/content/manage/articles/", body, format="json").status_code == 403
    assert auth_client(psychologist.user).get("/api/v1/content/manage/articles/").status_code == 403
    assert auth_client(client_user).get("/api/v1/content/manage/practices/").status_code == 403


@pytest.mark.django_db
def test_staff_crud_article(admin_user, api):
    a = auth_client(admin_user)
    resp = a.post("/api/v1/content/manage/articles/", {
        "title": "Новая статья", "slug": "novaya-statya", "summary": "Кратко", "body": "## Заголовок\n\nТекст",
        "topic": "sleep", "tags": ["сон"], "cover": "mint", "emoji": "🌙", "reading_minutes": 3,
    }, format="json")
    assert resp.status_code == 201, resp.content
    art = resp.json()
    assert art["is_published"] is False and art["published_at"] is None
    assert api.get("/api/v1/content/articles/novaya-statya/").status_code == 404

    resp = a.patch(f"/api/v1/content/manage/articles/{art['id']}/", {"is_published": True}, format="json")
    assert resp.status_code == 200 and resp.json()["published_at"]
    assert api.get("/api/v1/content/articles/novaya-statya/").json()["body"].startswith("## Заголовок")

    assert a.patch(f"/api/v1/content/manage/articles/{art['id']}/", {"cover": "neon"}, format="json").status_code == 400
    assert a.post("/api/v1/content/manage/articles/", {"title": "x", "slug": "novaya-statya", "body": "y"},
                  format="json").status_code == 400  # duplicate slug

    drafts = a.get("/api/v1/content/manage/articles/").json()
    assert any(x["slug"] == "novaya-statya" for x in drafts)
    assert a.delete(f"/api/v1/content/manage/articles/{art['id']}/").status_code == 204
    assert not Article.objects.filter(slug="novaya-statya").exists()


@pytest.mark.django_db
def test_staff_practice_validation(admin_user):
    a = auth_client(admin_user)
    base = {"title": "Практика", "slug": "praktika", "kind": "breathing", "duration_minutes": 3}
    assert a.post("/api/v1/content/manage/practices/", {**base, "steps": [{"title": "Пусто"}]},
                  format="json").status_code == 400
    assert a.post("/api/v1/content/manage/practices/", {**base, "steps": [], "pattern": {"inhale": 0, "exhale": 4}},
                  format="json").status_code == 400
    resp = a.post("/api/v1/content/manage/practices/", {
        **base, "is_published": True, "pattern": {"inhale": "4", "exhale": 6},
        "steps": [{"title": "Шаг", "text": "Дышите", "seconds": "30", "junk": 1}],
    }, format="json")
    assert resp.status_code == 201, resp.content
    body = resp.json()
    assert body["steps"] == [{"title": "Шаг", "text": "Дышите", "seconds": 30}]
    assert body["pattern"] == {"inhale": 4, "hold": 0, "exhale": 6, "hold_after": 0, "cycles": 4}


@pytest.mark.django_db
def test_seed_command_is_idempotent_and_keeps_edits():
    from django.core.management import call_command

    Article.objects.filter(slug="vygoranie").update(title="Отредактировано")
    call_command("seed_content")
    assert Article.objects.count() == len(ARTICLES)
    assert Article.objects.get(slug="vygoranie").title == "Отредактировано"


@pytest.mark.django_db
def test_write_access_follows_staff_roles(db):
    from apps.staff.models import StaffMember
    from apps.users.models import User

    editor = User.objects.create_anonymous_client("editorpass123")
    StaffMember.objects.create(user=editor, role="editor")
    support = User.objects.create_anonymous_client("supportpass123")
    StaffMember.objects.create(user=support, role="support")

    body = {"title": "Роль", "slug": "rol", "body": "Текст"}
    assert auth_client(editor).post("/api/v1/content/manage/articles/", body, format="json").status_code == 201
    assert auth_client(support).post("/api/v1/content/manage/articles/", {**body, "slug": "rol-2"},
                                     format="json").status_code == 403
