from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.conf import settings as dj_settings
from rest_framework import serializers

from . import engine
from .services import allowed_durations, hhmm, parse_hhmm

MAX_TEMPLATES = 12
MAX_RANGES_PER_DAY = 8


class RangeField(serializers.Field):
    """{"start": "10:00", "end": "14:00"} ↔ (600, 840). Конец может быть «24:00»."""

    def to_representation(self, value):
        s, e = value
        return {"start": hhmm(s), "end": hhmm(e)}

    def to_internal_value(self, data):
        if not isinstance(data, dict):
            raise serializers.ValidationError("Ожидается объект {start, end}.")
        try:
            return (parse_hhmm(data.get("start", "")), parse_hhmm(data.get("end", "")))
        except (ValueError, TypeError, AttributeError):
            raise serializers.ValidationError("Время в формате ЧЧ:ММ.")


def ranges_error(ranges) -> str | None:
    if len(ranges) > MAX_RANGES_PER_DAY:
        return f"Не больше {MAX_RANGES_PER_DAY} интервалов в день."
    return engine.validate_ranges(ranges)


class TemplateSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    valid_from = serializers.DateField(allow_null=True, required=False, default=None)
    valid_until = serializers.DateField(allow_null=True, required=False, default=None)
    days = serializers.ListField(
        child=serializers.ListField(child=RangeField(), allow_empty=True), min_length=7, max_length=7
    )

    def validate_days(self, days):
        for ranges in days:
            error = ranges_error(ranges)
            if error:
                raise serializers.ValidationError(error)
        return [sorted(r) for r in days]

    def validate(self, attrs):
        a, b = attrs.get("valid_from"), attrs.get("valid_until")
        if a and b and b < a:
            raise serializers.ValidationError({"valid_until": ["Дата окончания раньше даты начала."]})
        return attrs


class SettingsSerializer(serializers.Serializer):
    time_zone = serializers.CharField(max_length=64, required=False)
    min_duration = serializers.ChoiceField(choices=engine.DURATION_OPTIONS, required=False)
    max_duration = serializers.ChoiceField(choices=engine.DURATION_OPTIONS, required=False)
    durations = serializers.ListField(
        child=serializers.ChoiceField(choices=engine.DURATION_OPTIONS), required=False, allow_empty=False
    )
    buffer_minutes = serializers.IntegerField(min_value=0, max_value=120, required=False)
    min_notice_minutes = serializers.IntegerField(min_value=0, max_value=7 * 1440, required=False)
    horizon_days = serializers.IntegerField(min_value=7, max_value=90, required=False)
    start_step_minutes = serializers.ChoiceField(choices=engine.STEP_OPTIONS, required=False)
    hourly_rate_rub = serializers.IntegerField(min_value=500, max_value=200_000, required=False)
    intro_enabled = serializers.BooleanField(required=False)
    intro_price_rub = serializers.IntegerField(min_value=0, max_value=engine.INTRO_MAX_PRICE_RUB, required=False)
    templates = TemplateSerializer(many=True, required=False)

    def validate_time_zone(self, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise serializers.ValidationError("Неизвестный часовой пояс.")
        return value

    def validate_templates(self, value):
        if len(value) > MAX_TEMPLATES:
            raise serializers.ValidationError(f"Не больше {MAX_TEMPLATES} расписаний.")
        return value

    def validate(self, attrs):
        current = self.instance
        lo = attrs.get("min_duration", current.min_duration if current else 50)
        hi = attrs.get("max_duration", current.max_duration if current else 180)
        if lo > hi:
            raise serializers.ValidationError({"max_duration": ["Самый длинный созвон короче самого короткого."]})
        durations = attrs.get("durations", current.durations if current else list(engine.DURATION_OPTIONS))
        attrs["durations"] = sorted({int(d) for d in durations})
        if not any(lo <= d <= hi for d in attrs["durations"]):
            raise serializers.ValidationError({"durations": ["Оставьте хотя бы одну длительность в выбранных пределах."]})
        return attrs


def settings_payload(s, templates) -> dict:
    durations = allowed_durations(s)
    return {
        "time_zone": s.time_zone,
        "min_duration": s.min_duration,
        "max_duration": s.max_duration,
        "durations": sorted(int(d) for d in s.durations),
        "allowed_durations": list(durations),
        "buffer_minutes": s.buffer_minutes,
        "min_notice_minutes": s.min_notice_minutes,
        "horizon_days": s.horizon_days,
        "start_step_minutes": s.start_step_minutes,
        "hourly_rate_rub": s.hourly_rate_rub,
        "prices": [{"minutes": d, "price_rub": engine.round_price(s.hourly_rate_rub, d)} for d in durations],
        "intro_enabled": bool(s.intro_enabled),
        "intro_price_rub": int(s.intro_price_rub or 0),
        "intro_minutes": engine.INTRO_MINUTES,
        "intro_max_price_rub": engine.INTRO_MAX_PRICE_RUB,
        "platform_fee_percent": dj_settings.PLATFORM_FEE_PERCENT,
        "templates": [
            {
                "id": t.id,
                "valid_from": t.valid_from.isoformat() if t.valid_from else None,
                "valid_until": t.valid_until.isoformat() if t.valid_until else None,
                "days": [
                    [RangeField().to_representation(r) for r in sorted(day)]
                    for day in _days(t)
                ],
            }
            for t in templates
        ],
        "options": {
            "durations": list(engine.DURATION_OPTIONS),
            "buffer_minutes": list(engine.BUFFER_OPTIONS),
            "min_notice_minutes": list(engine.NOTICE_OPTIONS),
            "horizon_days": list(engine.HORIZON_OPTIONS),
            "start_step_minutes": list(engine.STEP_OPTIONS),
        },
    }


def _days(template):
    days = [[] for _ in range(7)]
    for r in template.rules.all():
        if 0 <= r.weekday <= 6:
            days[r.weekday].append((r.start_minute, r.end_minute))
    return days


class OverrideSerializer(serializers.Serializer):
    ranges = serializers.ListField(child=RangeField(), allow_empty=True)

    def validate_ranges(self, value):
        error = ranges_error(value)
        if error:
            raise serializers.ValidationError(error)
        return sorted(value)


class TimeOffSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    note = serializers.CharField(max_length=80, required=False, allow_blank=True, default="")

    def validate(self, attrs):
        if attrs["end_date"] < attrs["start_date"]:
            raise serializers.ValidationError({"end_date": ["Последний день отпуска раньше первого."]})
        if (attrs["end_date"] - attrs["start_date"]).days > 366:
            raise serializers.ValidationError({"end_date": ["Отпуск не может быть дольше года."]})
        return attrs
