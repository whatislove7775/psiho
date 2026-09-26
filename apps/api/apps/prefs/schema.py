"""Белый список настроек. Всё, чего нет в схеме, отбрасывается."""
from rest_framework.exceptions import ValidationError

STEALTH_PRESETS = ("notes", "weather", "calendar", "docs")
EXIT_TARGETS = ("weather", "news", "search", "wiki")


def _bool(v, field):
    if not isinstance(v, bool):
        raise ValidationError({field: "Ожидается true или false."})
    return v


def _choice(v, choices, field):
    if v not in choices:
        raise ValidationError({field: f"Допустимо: {', '.join(choices)}."})
    return v


def clean_stealth(raw) -> dict:
    if not isinstance(raw, dict):
        raise ValidationError({"stealth": "Ожидается объект."})
    out = {}
    if "enabled" in raw:
        out["enabled"] = _bool(raw["enabled"], "stealth.enabled")
    if "preset" in raw:
        out["preset"] = _choice(raw["preset"], STEALTH_PRESETS, "stealth.preset")
    if "exit" in raw:
        out["exit"] = _choice(raw["exit"], EXIT_TARGETS, "stealth.exit")
    if "wipe" in raw:
        out["wipe"] = _bool(raw["wipe"], "stealth.wipe")
    return out


def clean_settings(raw, current: dict | None = None) -> dict:
    """Сливает частичное обновление с текущими настройками."""
    if not isinstance(raw, dict):
        raise ValidationError({"detail": "Ожидается объект."})
    data = dict(current or {})
    if "stealth" in raw:
        data["stealth"] = {**data.get("stealth", {}), **clean_stealth(raw["stealth"])}
    if "screen_protect" in raw:
        data["screen_protect"] = _bool(raw["screen_protect"], "screen_protect")
    if "v" in raw:
        # Метка времени изменения на устройстве (мс) — чтобы устройства понимали, чья версия новее
        v = raw["v"]
        if not isinstance(v, int) or isinstance(v, bool) or v < 0:
            raise ValidationError({"v": "Ожидается целое число."})
        data["v"] = v
    return data
