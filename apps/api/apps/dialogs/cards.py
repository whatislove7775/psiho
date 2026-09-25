"""
Системные карточки созвонов в ленте диалога.

В chat.Message (kind=system) хранится только код события, например
``call:booked:<session_id>``; текст для превью и данные карточки строятся на лету,
поэтому карточка всегда показывает актуальный статус созвона.
"""
from zoneinfo import ZoneInfo

from django.conf import settings

from apps.sessions.models import ConsultationSession
from apps.sessions.serializers import can_join

MONTHS = ["янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.", "дек."]


def _tz():
    return ZoneInfo(getattr(settings, "SCHEDULE_TIME_ZONE", "Europe/Moscow"))


def human_dt(dt) -> str:
    local = dt.astimezone(_tz())
    return f"{local.day} {MONTHS[local.month - 1]}, {local:%H:%M}"


def minutes_label(n: int) -> str:
    return f"{n} мин"


def call_brief(session: ConsultationSession) -> dict:
    return {
        "id": str(session.id),
        "status": session.status,
        "scheduled_at": session.scheduled_at.isoformat(),
        "duration_minutes": session.duration_minutes,
        "amount_rub": session.amount_kopecks // 100,
        "can_join": can_join(session),
    }


def proposal_brief(p) -> dict:
    from django.utils import timezone

    status = p.status
    if status == "pending" and p.scheduled_at <= timezone.now():
        status = "expired"
    return {
        "id": str(p.id),
        "status": status,
        "scheduled_at": p.scheduled_at.isoformat(),
        "duration_minutes": p.duration_minutes,
        "price_rub": p.price_rub,
        "session_id": str(p.session_id) if p.session_id else None,
    }


def _parse(code: str):
    parts = (code or "").split(":")
    if len(parts) < 3 or parts[0] != "call":
        return None
    return parts[1], parts[2], parts[3:]


def _session(sid):
    try:
        return ConsultationSession.objects.filter(pk=sid).first()
    except Exception:  # noqa: BLE001 — битый id в коде
        return None


def card_for(code: str) -> dict | None:
    parsed = _parse(code)
    if not parsed:
        return None
    event, ref, extra = parsed
    if event == "proposed":
        from .models import CallProposal

        try:
            p = CallProposal.objects.filter(pk=ref).first()
        except Exception:  # noqa: BLE001
            p = None
        if p is None:
            return {"type": "proposed", "proposal": None, "call": None}
        return {"type": "proposed", "proposal": proposal_brief(p), "call": None}
    session = _session(ref)
    data = {"type": event, "call": call_brief(session) if session else None}
    if event in ("rescheduled", "cancelled") and extra:
        data["by"] = extra[0]
    if event == "cancelled" and len(extra) > 1:
        data["late"] = extra[1] == "late"
    if event == "ended" and extra:
        try:
            data["minutes"] = int(extra[0])
        except ValueError:
            data["minutes"] = None
    return data


def card_text(code: str) -> str:
    card = card_for(code)
    if not card:
        return ""
    t = card["type"]
    call = card.get("call")
    if t == "proposed":
        p = card.get("proposal")
        if not p:
            return "Предложение времени созвона"
        from django.utils.dateparse import parse_datetime

        return f"Предложено время созвона: {human_dt(parse_datetime(p['scheduled_at']))}, {minutes_label(p['duration_minutes'])}"
    if not call:
        return "Созвон"
    from django.utils.dateparse import parse_datetime

    when = human_dt(parse_datetime(call["scheduled_at"]))
    if t == "booked":
        return f"Созвон назначен: {when}, {minutes_label(call['duration_minutes'])}"
    if t == "rescheduled":
        return f"Созвон перенесён на {when}"
    if t == "cancelled":
        return f"Созвон {when} отменён"
    if t == "started":
        return "Созвон начался"
    if t == "ended":
        m = card.get("minutes")
        return f"Созвон завершён, {minutes_label(m)}" if m else "Созвон завершён"
    return "Созвон"
