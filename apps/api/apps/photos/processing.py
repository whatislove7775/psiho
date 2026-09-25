"""Validation and normalisation of specialist photos (Pillow)."""
from io import BytesIO

from django.core.files.base import ContentFile
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_BYTES = 5 * 1024 * 1024
MIN_SIDE = 200
MAX_PIXELS = 40_000_000  # decompression-bomb guard (e.g. 8000×5000)
OUT_SIZE = 512
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}


class PhotoError(ValueError):
    pass


def _crop_box(w: int, h: int, crop: dict | None) -> tuple[int, int, int, int]:
    """Square crop box. `crop` = {x, y, size} as fractions of the (oriented) image:
    x/y — top-left corner relative to width/height, size — side relative to min(w, h).
    Without it (or if it's invalid) a centred square is used."""
    side = min(w, h)
    left, top = (w - side) // 2, (h - side) // 2
    if crop:
        try:
            s = float(crop.get("size", 1))
            x = float(crop.get("x", 0))
            y = float(crop.get("y", 0))
        except (TypeError, ValueError):
            raise PhotoError("Неверные параметры кадрирования.")
        if not (0.1 <= s <= 1.0) or not (0 <= x <= 1) or not (0 <= y <= 1):
            raise PhotoError("Неверные параметры кадрирования.")
        side = max(1, round(min(w, h) * s))
        left = min(max(0, round(x * w)), w - side)
        top = min(max(0, round(y * h)), h - side)
    return left, top, left + side, top + side


def process_photo(upload, crop: dict | None = None) -> ContentFile:
    """Validate an uploaded image and return a 512×512 WebP without metadata."""
    if upload is None:
        raise PhotoError("Выберите файл с фотографией.")
    if upload.size > MAX_BYTES:
        raise PhotoError("Файл больше 5 МБ. Выберите фото поменьше.")
    data = upload.read()
    try:
        with Image.open(BytesIO(data)) as probe:
            fmt = probe.format
            w, h = probe.size
            probe.verify()
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError):
        raise PhotoError("Не получилось прочитать изображение. Подойдёт JPEG, PNG или WebP.")
    if fmt not in ALLOWED_FORMATS:
        raise PhotoError("Подойдёт только JPEG, PNG или WebP.")
    if w * h > MAX_PIXELS:
        raise PhotoError("Слишком большое изображение. Уменьшите его до 8000 пикселей по стороне.")

    try:
        img = Image.open(BytesIO(data))
        img.load()
        img = ImageOps.exif_transpose(img)  # apply orientation, then EXIF is dropped
    except Exception:
        raise PhotoError("Не получилось прочитать изображение. Попробуйте другой файл.")
    w, h = img.size
    if min(w, h) < MIN_SIDE:
        raise PhotoError(f"Фото слишком маленькое. Нужно хотя бы {MIN_SIDE}×{MIN_SIDE} пикселей.")

    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.getchannel("A"))
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")

    img = img.crop(_crop_box(w, h, crop)).resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS)
    out = BytesIO()
    # A fresh image object: no EXIF / ICC / XMP is written.
    clean = Image.new("RGB", img.size)
    clean.paste(img)
    clean.save(out, format="WEBP", quality=86, method=5)
    return ContentFile(out.getvalue(), name="photo.webp")
