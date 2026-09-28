"""Обложки статей: проверка, кадр 16:9, WebP в трёх размерах, без EXIF (Pillow).

Рекомендуем 1600×900, принимаем JPEG/PNG/WebP до 5 МБ, кадр не меньше 640×360.
"""
from io import BytesIO

from django.core.files.base import ContentFile
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_BYTES = 5 * 1024 * 1024
MAX_PIXELS = 40_000_000
MIN_W, MIN_H = 640, 360
ASPECT = 16 / 9
SIZES = (("image", 1600), ("image_md", 800), ("image_sm", 480))
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}


class CoverError(ValueError):
    pass


def _box(w: int, h: int, crop: dict | None) -> tuple[int, int, int, int]:
    """16:9 box. `crop` = {x, y, w} — доли ширины/высоты исходника (x, y — левый верхний угол,
    w — ширина кадра). Высота всегда выводится из 16:9. Без crop — самый большой кадр по центру."""
    cw = min(w, round(h * ASPECT))
    left, top = (w - cw) // 2, (h - round(cw / ASPECT)) // 2
    if crop:
        try:
            fw, fx, fy = float(crop.get("w", 1)), float(crop.get("x", 0)), float(crop.get("y", 0))
        except (TypeError, ValueError, AttributeError):
            raise CoverError("Неверные параметры кадрирования.")
        if not (0.05 <= fw <= 1.0) or not (0 <= fx <= 1) or not (0 <= fy <= 1):
            raise CoverError("Неверные параметры кадрирования.")
        cw = max(1, min(round(w * fw), w, round(h * ASPECT)))
        left = min(max(0, round(fx * w)), w - cw)
        top = min(max(0, round(fy * h)), h - round(cw / ASPECT))
    ch = round(cw / ASPECT)
    return left, max(0, top), left + cw, max(0, top) + ch


def process_cover(upload, crop: dict | None = None) -> dict:
    """→ {"image": ContentFile, "image_md": ..., "image_sm": ..., "width", "height"}."""
    if upload is None:
        raise CoverError("Выберите картинку для обложки.")
    if upload.size > MAX_BYTES:
        raise CoverError("Файл больше 5 МБ. Сожмите картинку или выберите другую.")
    data = upload.read()
    try:
        with Image.open(BytesIO(data)) as probe:
            fmt = probe.format
            w, h = probe.size
            probe.verify()
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError):
        raise CoverError("Не получилось прочитать картинку. Подойдёт JPG, PNG или WebP.")
    if fmt not in ALLOWED_FORMATS:
        raise CoverError("Подойдёт только JPG, PNG или WebP.")
    if w * h > MAX_PIXELS:
        raise CoverError("Слишком большое изображение. Уменьшите его до 8000 пикселей по стороне.")
    try:
        img = Image.open(BytesIO(data))
        img.load()
        img = ImageOps.exif_transpose(img)
    except Exception:
        raise CoverError("Не получилось прочитать картинку. Попробуйте другой файл.")
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.getchannel("A"))
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")

    box = _box(img.width, img.height, crop)
    img = img.crop(box)
    if img.width < MIN_W or img.height < MIN_H:
        raise CoverError(f"Кадр слишком маленький: нужно хотя бы {MIN_W}×{MIN_H}, лучше 1600×900.")

    out = {}
    for field, target in SIZES:
        tw = min(target, img.width)
        th = round(tw / ASPECT)
        variant = img.resize((tw, th), Image.LANCZOS)
        clean = Image.new("RGB", variant.size)  # fresh image: no EXIF / ICC / XMP
        clean.paste(variant)
        buf = BytesIO()
        clean.save(buf, format="WEBP", quality=84, method=5)
        out[field] = ContentFile(buf.getvalue(), name="cover.webp")
        if field == "image":
            out["width"], out["height"] = tw, th
    return out


# ── Картинки внутри статьи ─────────────────────────────────────────────────
IMAGE_MAX_BYTES = 10 * 1024 * 1024
IMAGE_MIN_W = 320
IMAGE_SIZES = (("image", 1600), ("image_md", 800))


def process_image(upload) -> dict:
    """Картинка в тексте: пропорции сохраняем, WebP 1600 и 800 px по ширине, без EXIF.
    → {"image": ContentFile, "image_md": ContentFile, "width", "height"}."""
    if upload is None:
        raise CoverError("Выберите картинку.")
    if upload.size > IMAGE_MAX_BYTES:
        raise CoverError("Файл больше 10 МБ. Сожмите картинку или выберите другую.")
    data = upload.read()
    try:
        with Image.open(BytesIO(data)) as probe:
            fmt = probe.format
            w, h = probe.size
            probe.verify()
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError):
        raise CoverError("Не получилось прочитать картинку. Подойдёт JPG, PNG или WebP.")
    if fmt not in ALLOWED_FORMATS:
        raise CoverError("Подойдёт только JPG, PNG или WebP.")
    if w * h > MAX_PIXELS:
        raise CoverError("Слишком большое изображение. Уменьшите его до 8000 пикселей по стороне.")
    try:
        img = Image.open(BytesIO(data))
        img.load()
        img = ImageOps.exif_transpose(img)
    except Exception:
        raise CoverError("Не получилось прочитать картинку. Попробуйте другой файл.")
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.getchannel("A"))
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")
    if img.width < IMAGE_MIN_W:
        raise CoverError(f"Картинка слишком маленькая: нужно хотя бы {IMAGE_MIN_W} пикселей в ширину.")
    if img.height > img.width * 3:
        raise CoverError("Слишком вытянутая картинка: высота больше ширины в три раза.")
    out = {}
    for field, target in IMAGE_SIZES:
        tw = min(target, img.width)
        th = max(1, round(img.height * tw / img.width))
        variant = img.resize((tw, th), Image.LANCZOS) if tw != img.width else img
        clean = Image.new("RGB", variant.size)  # fresh image: no EXIF / ICC / XMP
        clean.paste(variant)
        buf = BytesIO()
        clean.save(buf, format="WEBP", quality=84, method=5)
        out[field] = ContentFile(buf.getvalue(), name="image.webp")
        if field == "image":
            out["width"], out["height"] = tw, th
    return out
