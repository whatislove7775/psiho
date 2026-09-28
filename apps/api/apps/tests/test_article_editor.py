"""P2: визуальный редактор статей (HTML + белый список), картинки в тексте, до трёх тем, оценки."""
from io import BytesIO

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from apps.content.models import Article, ArticleImage, ArticleRating
from apps.content.richtext import markdown_to_html, sanitize_html, word_count
from apps.users.models import User

from .conftest import auth_client

WORDS = " ".join(["Слово"] * 200)


@pytest.fixture(autouse=True)
def _media(settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    return tmp_path


def _png(w, h, exif=False):
    buf = BytesIO()
    kwargs = {}
    if exif:
        ex = Image.Exif()
        ex[0x010F] = "SecretCam"
        kwargs["exif"] = ex.tobytes()
    Image.new("RGB", (w, h), (200, 120, 90)).save(buf, format="JPEG" if exif else "PNG", **kwargs)
    return SimpleUploadedFile("x.png", buf.getvalue(), content_type="image/png")


# ── Очистка HTML ──────────────────────────────────────────────────────────

def test_sanitize_keeps_formatting_and_drops_foreign_styles():
    dirty = (
        '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1">'
        '<h1 style="font-size:26pt"><span style="font-family:Arial;color:#ff0000">Заголовок</span></h1>'
        '<p class="MsoNormal" style="margin:0"><span style="font-size:11pt">Обычный <b>жирный</b> и <i>курсив</i>, '
        '<a href="https://example.org/x" style="color:blue" onclick="evil()">ссылка</a>.</span></p>'
        "<ul><li><p>пункт</p></li></ul><blockquote><p>цитата</p></blockquote>"
        "<script>alert(1)</script><style>p{color:red}</style>"
        '<p><a href="javascript:alert(1)">плохая</a> <img src="https://evil.example/x.png" onerror="x()"></p>'
        "</b>"
    )
    out = sanitize_html(dirty)
    assert out == (
        "<h2>Заголовок</h2><p>Обычный <strong>жирный</strong> и <em>курсив</em>, "
        '<a href="https://example.org/x">ссылка</a>.</p><ul><li><p>пункт</p></li></ul>'
        "<blockquote><p>цитата</p></blockquote><p>плохая </p>"
    )
    for bad in ("style", "class", "onclick", "script", "alert", "evil", "font", "span"):
        assert bad not in out


def test_sanitize_figures_only_own_images_and_escapes_text():
    src = "/media/content/" + "a" * 32 + ".webp"
    out = sanitize_html(
        f'<figure data-width="wide" class="x"><img src="https://aprosop.ru{src}" alt="Кот"><figcaption>Подпись &lt;b&gt;</figcaption></figure>'
        '<figure data-width="huge"><img src="/media/covers/x.webp"></figure>'
        "<aside><p>Врезка</p></aside><p>a &amp; b &lt;script&gt;</p><h5>мелкий</h5>"
    )
    assert out == (
        f'<figure data-width="wide"><img src="{src}" alt="Кот"><figcaption>Подпись &lt;b&gt;</figcaption></figure>'
        "<aside><p>Врезка</p></aside><p>a &amp; b &lt;script&gt;</p><h3>мелкий</h3>"
    )
    # Кривую вложенность выпрямляем
    assert sanitize_html("<p><strong>a<em>b</p>c") == "<p><strong>a<em>b</em></strong></p>c"


def test_markdown_to_html_conversion():
    md = "Абзац **жирный** и *курсив* [1].\n\n## Раздел\n\n- один\n- два\n\n> цитата\n\n---\n\n[ссылка](https://x.org) [плохо](javascript:x)"
    assert markdown_to_html(md) == (
        "<p>Абзац <strong>жирный</strong> и <em>курсив</em> [1].</p><h2>Раздел</h2>"
        "<ul><li><p>один</p></li><li><p>два</p></li></ul><blockquote><p>цитата</p></blockquote><hr>"
        '<p><a href="https://x.org">ссылка</a> плохо</p>'
    )
    assert word_count("<p>раз два</p><h2>три</h2>") == 3


@pytest.mark.django_db
def test_seeded_articles_migrated_to_html():
    a = Article.objects.get(slug="vygoranie")
    assert a.body and a.content.startswith("<") and "**" not in a.content and a.topics == [a.topic]
    assert sanitize_html(a.content) == a.content


# ── Статьи: текст и темы ──────────────────────────────────────────────────

@pytest.mark.django_db
def test_specialist_writes_html_with_up_to_three_topics(api, psychologist):
    psy = auth_client(psychologist.user)
    html = f'<h2>Раздел</h2><p style="color:red">{WORDS}</p><script>x()</script>'
    r = psy.post("/api/v1/content/my/articles/", {
        "title": "Тревога и сон", "summary": "Коротко о том, как тревога мешает уснуть.",
        "content": html, "topics": ["sleep", "anxiety", "sleep"],
    }, format="json")
    assert r.status_code == 201, r.content
    art = r.json()
    assert art["content"] == f"<h2>Раздел</h2><p>{WORDS}</p>"
    assert art["topics"] == ["sleep", "anxiety"] and art["topic"] == "sleep"
    assert art["topic_labels"] == ["Сон", "Тревога"] and art["reading_minutes"] == 1

    bad = psy.patch(f"/api/v1/content/my/articles/{art['id']}/",
                    {"topics": ["sleep", "anxiety", "work", "family"]}, format="json")
    assert bad.status_code == 400 and "topics" in bad.json()
    assert psy.patch(f"/api/v1/content/my/articles/{art['id']}/", {"topics": ["nope"]}, format="json").status_code == 400
    assert psy.patch(f"/api/v1/content/my/articles/{art['id']}/", {"topics": []}, format="json").status_code == 400
    r = psy.patch(f"/api/v1/content/my/articles/{art['id']}/", {"topics": ["work", "stress", "self"]}, format="json")
    assert r.status_code == 200 and r.json()["topic"] == "work"
    assert psy.post(f"/api/v1/content/my/articles/{art['id']}/submit/").status_code == 200


@pytest.mark.django_db
def test_topic_filter_and_counts_use_all_topics(api, admin_user):
    a = auth_client(admin_user)
    r = a.post("/api/v1/content/manage/articles/", {
        "title": "Работа и семья", "slug": "rabota-i-semya", "content": "<p>Текст</p>",
        "topics": ["work", "family"], "is_published": True,
    }, format="json")
    assert r.status_code == 201, r.content
    assert r.json()["topic"] == "work"
    slugs = lambda q: [x["slug"] for x in api.get(f"/api/v1/content/articles/?topic={q}").json()]
    assert "rabota-i-semya" in slugs("family") and "rabota-i-semya" in slugs("work")
    assert "rabota-i-semya" in slugs("teens,family") and "rabota-i-semya" not in slugs("sleep")
    counts = {t["value"]: t["count"] for t in api.get("/api/v1/content/topics/").json()}
    assert counts["family"] == 1 and counts["work"] == 1
    detail = api.get("/api/v1/content/articles/rabota-i-semya/").json()
    assert detail["content"] == "<p>Текст</p>" and "body" not in detail
    # Без текста статью не создать
    assert a.post("/api/v1/content/manage/articles/", {"title": "Пусто", "slug": "pusto"}, format="json").status_code == 400


# ── Картинки в тексте ─────────────────────────────────────────────────────

@pytest.mark.django_db
def test_image_upload_variants_exif_and_permissions(api, psychologist, client_user, _media):
    assert api.post("/api/v1/content/images/", {"image": _png(1200, 800)}, format="multipart").status_code == 401
    assert auth_client(client_user).post(
        "/api/v1/content/images/", {"image": _png(1200, 800)}, format="multipart").status_code == 403

    psy = auth_client(psychologist.user)
    r = psy.post("/api/v1/content/images/", {"image": _png(2400, 1200, exif=True)}, format="multipart")
    assert r.status_code == 201, r.content
    data = r.json()
    assert data["width"] == 1600 and data["height"] == 800
    assert data["url"].startswith("/media/content/") and data["md"].endswith("-md.webp")
    img = ArticleImage.objects.get(pk=data["id"])
    with Image.open(img.image.path) as big, Image.open(img.image_md.path) as md:
        assert big.format == "WEBP" and big.size == (1600, 800) and md.size == (800, 400)
        assert not big.getexif() and "exif" not in big.info

    # Картинка встаёт в текст; чужие адреса вычищаются
    html = f'<figure data-width="wide"><img src="{data["url"]}" alt=""><figcaption>Схема</figcaption></figure>'
    assert sanitize_html(html) == html

    small = psy.post("/api/v1/content/images/", {"image": _png(200, 200)}, format="multipart")
    assert small.status_code == 400
    junk = SimpleUploadedFile("x.png", b"not an image", content_type="image/png")
    assert psy.post("/api/v1/content/images/", {"image": junk}, format="multipart").status_code == 400


# ── Оценки ────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_ratings_logged_in_only_one_per_user_anonymous(api, client_user, psychologist):
    url = "/api/v1/content/articles/vygoranie/rating/"
    r = api.get(url).json()
    assert r == {"avg": None, "count": 0, "mine": None, "can_rate": False}
    assert api.put(url, {"stars": 5}, format="json").status_code == 401

    c = auth_client(client_user)
    assert c.get(url).json()["can_rate"] is True
    assert c.put(url, {"stars": 6}, format="json").status_code == 400
    assert c.put(url, {"stars": 4}, format="json").json() == {"avg": 4.0, "count": 1, "mine": 4, "can_rate": True}
    assert c.put(url, {"stars": 5}, format="json").json()["count"] == 1  # изменить, не добавить
    other = User.objects.create_user(alias="drugoy-kit-0002", password="demo-password-123")
    auth_client(other).put(url, {"stars": 2}, format="json")
    assert ArticleRating.objects.filter(article__slug="vygoranie").count() == 2

    public = api.get(url).json()
    assert public == {"avg": 3.5, "count": 2, "mine": None, "can_rate": False}
    card = next(x for x in api.get("/api/v1/content/articles/").json() if x["slug"] == "vygoranie")
    assert card["rating"] == {"avg": 3.5, "count": 2}
    detail = api.get("/api/v1/content/articles/vygoranie/").json()
    assert detail["rating"] == {"avg": 3.5, "count": 2}
    # Ни в одном ответе нет того, кто оценил
    for body in (str(public), str(card), str(detail)):
        assert client_user.alias not in body and "user" not in body

    assert c.delete(url).json() == {"avg": 2.0, "count": 1, "mine": None, "can_rate": True}
    assert api.get("/api/v1/content/articles/nope/rating/").status_code == 404


@pytest.mark.django_db
def test_author_cannot_rate_own_article(psychologist, client_user):
    a = Article.objects.create(title="Моя", slug="moya", content="<p>x</p>", specialist=psychologist,
                               moderation="approved", is_published=True)
    psy = auth_client(psychologist.user)
    url = f"/api/v1/content/articles/{a.slug}/rating/"
    assert psy.get(url).json()["can_rate"] is False
    assert psy.put(url, {"stars": 5}, format="json").status_code == 403
    assert auth_client(client_user).put(url, {"stars": 5}, format="json").status_code == 200
