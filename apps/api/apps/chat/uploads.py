"""Проверка загружаемых файлов и голосовых: тип по расширению + сигнатуре, размер."""
import json
import os

from rest_framework.exceptions import ValidationError

from . import conf

# расширение → (mime, проверка сигнатуры)
_ZIP = b"PK\x03\x04"
_OLE = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
FILE_TYPES: dict[str, tuple[str, tuple[bytes, ...] | None]] = {
    "pdf": ("application/pdf", (b"%PDF",)),
    "doc": ("application/msword", (_OLE,)),
    "docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", (_ZIP,)),
    "xls": ("application/vnd.ms-excel", (_OLE,)),
    "xlsx": ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", (_ZIP,)),
    "pptx": ("application/vnd.openxmlformats-officedocument.presentationml.presentation", (_ZIP,)),
    "odt": ("application/vnd.oasis.opendocument.text", (_ZIP,)),
    "rtf": ("application/rtf", (b"{\\rtf",)),
    "txt": ("text/plain", None),
    "png": ("image/png", (b"\x89PNG\r\n\x1a\n",)),
    "jpg": ("image/jpeg", (b"\xff\xd8\xff",)),
    "jpeg": ("image/jpeg", (b"\xff\xd8\xff",)),
    "webp": ("image/webp", (b"RIFF",)),
    "gif": ("image/gif", (b"GIF87a", b"GIF89a")),
    "mp3": ("audio/mpeg", (b"ID3", b"\xff\xfb", b"\xff\xf3", b"\xff\xf2")),
}

VOICE_MIMES = {"audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/aac", "audio/wav", "audio/x-wav"}
VOICE_SIGNATURES = (b"\x1a\x45\xdf\xa3", b"OggS", b"RIFF", b"ID3", b"\xff\xf1", b"\xff\xf9", b"\xff\xfb")
MAX_VOICE_MS = 10 * 60 * 1000
PEAKS_MAX = 96


def _read(upload) -> bytes:
    upload.seek(0)
    return upload.read()


def validate_file(upload) -> tuple[bytes, str, str]:
    """→ (данные, mime, безопасное имя)."""
    name = os.path.basename(upload.name or "file")[:120] or "file"
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in FILE_TYPES:
        raise ValidationError({"file": "Такой тип файла нельзя отправить. Подойдут PDF, документы Word/Excel, "
                                       "изображения и текстовые файлы."})
    if upload.size > conf.max_file_bytes():
        raise ValidationError({"file": f"Файл больше {conf.max_file_bytes() // (1024 * 1024)} МБ."})
    data = _read(upload)
    if not data:
        raise ValidationError({"file": "Файл пустой."})
    mime, sigs = FILE_TYPES[ext]
    if sigs is not None and not any(data.startswith(s) for s in sigs):
        raise ValidationError({"file": "Содержимое файла не совпадает с его расширением."})
    if ext == "webp" and data[8:12] != b"WEBP":
        raise ValidationError({"file": "Содержимое файла не совпадает с его расширением."})
    if ext == "txt":
        try:
            data[:4096].decode("utf-8")
        except UnicodeDecodeError:
            pass  # cp1251 и т.п. — допустимо
        if b"\x00" in data[:4096]:
            raise ValidationError({"file": "Это не текстовый файл."})
    return data, mime, name


def validate_voice(upload, duration_ms, peaks_raw) -> tuple[bytes, str, int, list]:
    mime = (upload.content_type or "").split(";")[0].strip().lower()
    if mime not in VOICE_MIMES:
        raise ValidationError({"file": "Неподдерживаемый формат голосового сообщения."})
    if upload.size > conf.max_voice_bytes():
        raise ValidationError({"file": "Голосовое сообщение слишком длинное."})
    data = _read(upload)
    if len(data) < 64:
        raise ValidationError({"file": "Голосовое сообщение пустое."})
    if mime != "audio/mp4" and not any(data.startswith(s) for s in VOICE_SIGNATURES):
        raise ValidationError({"file": "Файл не похож на аудио."})
    if mime == "audio/mp4" and data[4:8] != b"ftyp":
        raise ValidationError({"file": "Файл не похож на аудио."})
    try:
        duration = int(float(duration_ms or 0))
    except (TypeError, ValueError):
        duration = 0
    if duration <= 0 or duration > MAX_VOICE_MS:
        raise ValidationError({"duration_ms": "Длительность от 1 секунды до 10 минут."})
    peaks: list = []
    if peaks_raw:
        try:
            parsed = json.loads(peaks_raw) if isinstance(peaks_raw, str) else peaks_raw
            if isinstance(parsed, list):
                peaks = [round(min(1.0, max(0.0, float(p))), 3) for p in parsed[:PEAKS_MAX]]
        except (TypeError, ValueError):
            peaks = []
    return data, mime, duration, peaks
