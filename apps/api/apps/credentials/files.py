"""Проверка и очистка загружаемых документов.

PDF — принимаем как есть (сигнатура %PDF-, размер). Изображения — перекодируем Pillow
в тот же формат с новым объектом картинки: EXIF/XMP/GPS и прочие метаданные не пишутся,
ориентация применяется заранее. Очень большие сканы уменьшаются до 3200 px по стороне.
"""
from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 50_000_000
MAX_SIDE = 3200
IMAGE_FORMATS = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}


class FileError(ValueError):
    pass


def clean_name(name: str, ext: str) -> str:
    base = (name or "document").rsplit("/", 1)[-1].rsplit("\\", 1)[-1].strip() or "document"
    stem = base.rsplit(".", 1)[0][:80] or "document"
    return f"{stem}.{ext}"


def process_upload(upload) -> dict:
    """→ {data, mime, name, width, height}. Бросает FileError с понятным текстом."""
    if upload is None:
        raise FileError("Выберите файл: PDF, JPG, PNG или WebP.")
    if upload.size > MAX_BYTES:
        raise FileError("Файл больше 10 МБ. Сожмите скан или разбейте документ на несколько файлов.")
    raw = upload.read()
    if not raw:
        raise FileError("Файл пустой.")
    if raw[:5] == b"%PDF-":
        return {"data": raw, "mime": "application/pdf", "name": clean_name(upload.name, "pdf"),
                "width": None, "height": None}
    try:
        with Image.open(BytesIO(raw)) as probe:
            fmt = probe.format
            w, h = probe.size
            probe.verify()
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError):
        raise FileError("Не получилось прочитать файл. Подойдёт PDF, JPG, PNG или WebP.")
    if fmt not in IMAGE_FORMATS:
        raise FileError("Подойдёт только PDF, JPG, PNG или WebP.")
    if w * h > MAX_PIXELS:
        raise FileError("Слишком большое изображение. Уменьшите скан до 8000 пикселей по стороне.")
    try:
        img = Image.open(BytesIO(raw))
        img.load()
        img = ImageOps.exif_transpose(img)
    except Exception:
        raise FileError("Не получилось прочитать изображение. Попробуйте другой файл.")

    if max(img.size) > MAX_SIDE:
        img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    keep_alpha = fmt in ("PNG", "WEBP") and img.mode in ("RGBA", "LA", "P")
    mode = "RGBA" if keep_alpha else "RGB"
    if img.mode != mode:
        img = img.convert(mode)
    # Новый объект: ни EXIF, ни ICC, ни XMP не переносятся
    clean = Image.new(mode, img.size)
    clean.paste(img)
    out = BytesIO()
    ext = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}[fmt]
    if fmt == "JPEG":
        clean.save(out, format="JPEG", quality=90, optimize=True)
    elif fmt == "PNG":
        clean.save(out, format="PNG", optimize=True)
    else:
        clean.save(out, format="WEBP", quality=90, method=4)
    data = out.getvalue()
    if len(data) > MAX_BYTES:
        raise FileError("После обработки файл больше 10 МБ. Сохраните скан в меньшем разрешении.")
    return {"data": data, "mime": IMAGE_FORMATS[fmt], "name": clean_name(upload.name, ext),
            "width": clean.width, "height": clean.height}
