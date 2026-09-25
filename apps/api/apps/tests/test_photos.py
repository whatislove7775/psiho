import json
from io import BytesIO
from pathlib import Path

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from apps.photos.models import SpecialistPhoto

from .conftest import auth_client

URL = "/api/v1/psychologist/photo/"


@pytest.fixture(autouse=True)
def _media(settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    return tmp_path


def make_image(fmt="JPEG", size=(900, 600), color=(200, 80, 40), exif=False, mode="RGB"):
    img = Image.new(mode, size, color if mode == "RGB" else color + (128,))
    buf = BytesIO()
    kwargs = {}
    if exif:
        ex = Image.Exif()
        ex[0x010F] = "SecretCam"  # Make
        ex[0x0112] = 6  # Orientation: rotate 90° CW
        kwargs["exif"] = ex.tobytes()
    img.save(buf, format=fmt, **kwargs)
    ext = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp", "GIF": "gif", "BMP": "bmp"}[fmt]
    return SimpleUploadedFile(f"me.{ext}", buf.getvalue(), content_type=f"image/{ext}")


def stored(tmp_path: Path, url: str) -> Image.Image:
    return Image.open(tmp_path / url.removeprefix("/media/"))


@pytest.mark.django_db
def test_upload_resizes_to_square_webp_and_strips_exif(psychologist, _media):
    api = auth_client(psychologist.user)
    res = api.post(URL, {"photo": make_image(exif=True)}, format="multipart")
    assert res.status_code == 200, res.data
    url = res.data["photo_url"]
    assert url.startswith("/media/specialists/") and url.endswith(".webp")
    img = stored(_media, url)
    assert img.format == "WEBP"
    assert img.size == (512, 512)
    assert not img.getexif()
    assert b"SecretCam" not in (_media / url.removeprefix("/media/")).read_bytes()


@pytest.mark.django_db
def test_png_with_alpha_and_crop(psychologist, _media):
    api = auth_client(psychologist.user)
    res = api.post(
        URL,
        {"photo": make_image("PNG", mode="RGBA"), "crop": json.dumps({"x": 0.1, "y": 0, "size": 0.5})},
        format="multipart",
    )
    assert res.status_code == 200, res.data
    assert stored(_media, res.data["photo_url"]).size == (512, 512)


@pytest.mark.django_db
def test_photo_url_in_public_serializers(psychologist, api):
    auth_client(psychologist.user).post(URL, {"photo": make_image("WEBP")}, format="multipart")
    listing = api.get("/api/v1/psychologists/").json()
    assert listing[0]["photo_url"].startswith("/media/specialists/")
    detail = api.get(f"/api/v1/psychologists/{psychologist.id}/").json()
    assert detail["photo_url"] == listing[0]["photo_url"]
    me = auth_client(psychologist.user).get("/api/v1/psychologist/profile/").json()
    assert me["photo_url"] == listing[0]["photo_url"]


@pytest.mark.django_db
def test_no_photo_is_null(psychologist, api):
    assert api.get(f"/api/v1/psychologists/{psychologist.id}/").json()["photo_url"] is None


@pytest.mark.django_db
def test_replace_deletes_old_file_and_delete_endpoint(psychologist, _media):
    api = auth_client(psychologist.user)
    first = api.post(URL, {"photo": make_image()}, format="multipart").data["photo_url"]
    second = api.post(URL, {"photo": make_image(color=(10, 10, 10))}, format="multipart").data["photo_url"]
    assert first != second
    assert not (_media / first.removeprefix("/media/")).exists()
    assert SpecialistPhoto.objects.count() == 1

    assert api.delete(URL).status_code == 204
    assert not (_media / second.removeprefix("/media/")).exists()
    assert SpecialistPhoto.objects.count() == 0
    assert api.delete(URL).status_code == 204  # idempotent


@pytest.mark.django_db
@pytest.mark.parametrize(
    "upload",
    [
        lambda: make_image("GIF"),
        lambda: make_image("BMP"),
        lambda: make_image(size=(120, 120)),
        lambda: SimpleUploadedFile("x.jpg", b"not an image", content_type="image/jpeg"),
        lambda: SimpleUploadedFile("big.jpg", b"\xff\xd8" + b"0" * (5 * 1024 * 1024 + 1), content_type="image/jpeg"),
    ],
)
def test_rejects_bad_files(psychologist, upload):
    res = auth_client(psychologist.user).post(URL, {"photo": upload()}, format="multipart")
    assert res.status_code == 400
    assert res.data["detail"]
    assert SpecialistPhoto.objects.count() == 0


@pytest.mark.django_db
def test_rejects_bad_crop_and_missing_file(psychologist):
    api = auth_client(psychologist.user)
    assert api.post(URL, {"photo": make_image(), "crop": "{oops"}, format="multipart").status_code == 400
    assert api.post(URL, {"photo": make_image(), "crop": json.dumps({"size": 5})}, format="multipart").status_code == 400
    assert api.post(URL, {}, format="multipart").status_code == 400


@pytest.mark.django_db
def test_only_psychologists(client_user, api):
    assert api.post(URL, {"photo": make_image()}, format="multipart").status_code == 401
    assert auth_client(client_user).post(URL, {"photo": make_image()}, format="multipart").status_code == 403


@pytest.mark.django_db
def test_session_payload_has_photo(psychologist, client_user):
    from apps.sessions.models import ConsultationSession
    from apps.sessions.serializers import SessionSerializer
    from django.utils import timezone

    auth_client(psychologist.user).post(URL, {"photo": make_image()}, format="multipart")
    psychologist.refresh_from_db()
    s = ConsultationSession(
        client=client_user, psychologist_profile=psychologist, scheduled_at=timezone.now(),
        duration_minutes=50, amount_kopecks=300000,
    )
    data = SessionSerializer(s).data
    assert data["psychologist"]["photo_url"].startswith("/media/specialists/")
