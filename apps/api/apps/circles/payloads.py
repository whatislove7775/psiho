"""JSON-представления круга. Участники — только псевдонимы и handle; никаких id пользователей и alias."""
from django.utils import timezone

from . import services as svc
from .models import Circle, Meeting, Membership

M = Membership.Status


def rules_list(circle: Circle) -> list[str]:
    text = circle.rules.strip() or svc.DEFAULT_RULES
    return [line.strip(" -•\t") for line in text.splitlines() if line.strip(" -•\t")]


def host_payload(circle: Circle, full: bool = False) -> dict:
    from apps.photos.utils import photo_url

    p = circle.host
    data = {
        "id": p.pk,
        "name": p.display_name,
        "photo_url": photo_url(p),
        "experience_years": p.experience_years,
        "specializations": list(p.specializations or [])[:6],
    }
    if full:
        data["bio"] = p.bio
        try:
            from apps.credentials.models import Credential

            data["verified_credentials"] = Credential.objects.filter(profile=p, status=Credential.Status.APPROVED).count()
        except Exception:  # pragma: no cover
            data["verified_credentials"] = 0
    return data


def meeting_payload(m: Meeting, now=None) -> dict:
    now = now or timezone.now()
    return {
        "id": str(m.id),
        "index": m.index,
        "starts_at": m.starts_at.isoformat(),
        "ends_at": m.ends_at.isoformat(),
        "status": m.status,
        "room_open": svc.room_open(m, now) is None,
    }


def circle_card(c: Circle, now=None) -> dict:
    now = now or timezone.now()
    meetings = list(svc.active_meetings(c))
    taken = svc.seats_taken(c)
    upcoming = [m for m in meetings if m.ends_at > now and m.status in ("scheduled", "live")]
    count = len(meetings)
    return {
        "id": str(c.id),
        "topic": c.topic,
        "topic_label": c.get_topic_display(),
        "title": c.title,
        "summary": c.description[:220],
        "format": c.format,
        "meetings_count": count,
        "meeting_minutes": c.meeting_minutes,
        "capacity": c.capacity,
        "seats_taken": taken,
        "seats_left": max(0, c.capacity - taken),
        "billing": c.billing,
        "price_kopecks": c.price_kopecks,
        "total_kopecks": c.price_kopecks if c.billing == "series" else c.price_kopecks * count,
        "status": c.status,
        "status_label": c.get_status_display(),
        "first_meeting_at": meetings[0].starts_at.isoformat() if meetings else None,
        "next_meeting_at": upcoming[0].starts_at.isoformat() if upcoming else None,
        "host": host_payload(c),
    }


def my_state(c: Circle, m: Membership | None) -> dict | None:
    if m is None:
        return None
    return {
        "status": m.status,
        "pseudonym": m.pseudonym,
        "handle": m.handle,
        "tone": m.tone,
        "chat_muted": m.chat_muted,
        "waitlist_position": svc.waitlist_position(m),
        "promote_failed": bool(m.promote_failed_at),
        "leave_terms": svc.leave_terms(m) if m.status == M.ACTIVE else None,
        "payments": svc.charges_summary(m) if m.status in (M.ACTIVE, M.LEFT) else None,
    }


def circle_detail(c: Circle, user=None, now=None) -> dict:
    now = now or timezone.now()
    data = circle_card(c, now)
    data.update({
        "description": c.description,
        "rules": rules_list(c),
        "allow_real_faces": c.allow_real_faces,
        "chat_retention": c.chat_retention,
        "host": host_payload(c, full=True),
        "meetings": [meeting_payload(m, now) for m in svc.active_meetings(c)],
        "waitlist_count": c.memberships.filter(status=M.WAITLIST).count(),
        "join_closed_reason": svc.join_closed_reason(c, now),
        "amount_due_kopecks": svc.amount_due(c, now),
        "cancel_rules": _cancel_rules(),
    })
    role = None
    me = None
    if user is not None and user.is_authenticated:
        if c.host.user_id == user.pk:
            role = "host"
        else:
            me = Membership.objects.filter(circle=c, user=user).first()
            if me is not None and me.status == M.ACTIVE:
                role = "member"
    data["my_role"] = role
    data["me"] = my_state(c, me)
    return data


def _cancel_rules() -> dict:
    from apps.billing import conf

    return {"free_cancel_hours": conf.free_cancel_hours(),
            "late_cancel_penalty_percent": conf.late_cancel_penalty_percent()}


def members_payload(c: Circle, viewer_role: str, viewer_membership: Membership | None) -> list[dict]:
    rows = []
    for m in c.memberships.filter(status=M.ACTIVE).order_by("joined_at"):
        row = {"handle": m.handle, "name": m.pseudonym, "tone": m.tone,
               "is_me": bool(viewer_membership and viewer_membership.pk == m.pk)}
        if viewer_role == "host":
            row["chat_muted"] = m.chat_muted
        rows.append(row)
    return rows


def circle_owner(c: Circle, now=None) -> dict:
    """Для ведущего: + статус проверки и участники (по псевдонимам)."""
    data = circle_detail(c, None, now)
    data.update({
        "my_role": "host",
        "review_comment": c.review_comment,
        "submitted_at": c.submitted_at.isoformat() if c.submitted_at else None,
        "reviewed_at": c.reviewed_at.isoformat() if c.reviewed_at else None,
        "cancel_reason": c.cancel_reason,
        "editable": c.status in Circle.EDITABLE,
        "members": members_payload(c, "host", None),
        "rules_text": c.rules,
    })
    return data


def circle_staff(c: Circle) -> dict:
    data = circle_owner(c)
    data["members"] = None  # персоналу участники не нужны
    data["host"]["status"] = c.host.verification_status
    return data
