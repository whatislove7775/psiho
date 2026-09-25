"""
Журнал действий персонала. Каждая мутация в админке вызывает `audit(...)`.

    from apps.staff.audit import audit
    audit(request, "content.article.publish", target=article, details={"slug": article.slug})

В details нельзя класть содержимое сообщений, email и другие персональные данные.
"""
import ipaddress
import logging

from .models import AuditLog
from .roles import get_staff_role

logger = logging.getLogger(__name__)


def client_ip(request) -> str | None:
    meta = getattr(request, "META", {}) or {}
    candidates = [
        meta.get("HTTP_X_REAL_IP", ""),
        (meta.get("HTTP_X_FORWARDED_FOR", "") or "").split(",")[0],
        meta.get("REMOTE_ADDR", ""),
    ]
    for raw in candidates:
        raw = (raw or "").strip()
        if not raw:
            continue
        try:
            return str(ipaddress.ip_address(raw))
        except ValueError:
            continue
    return None


def _describe(target) -> tuple[str, str, str]:
    if target is None:
        return "", "", ""
    if isinstance(target, tuple):
        kind, pk, label = (list(target) + ["", "", ""])[:3]
        return str(kind), str(pk), str(label)[:120]
    model = target.__class__.__name__
    kind = {
        "User": "user",
        "PsychologistProfile": "specialist",
        "ConsultationSession": "session",
        "Report": "report",
        "StaffMember": "staff",
    }.get(model, model.lower())
    if model == "User":
        label = target.alias
    elif model == "PsychologistProfile":
        label = target.display_name
    elif model == "StaffMember":
        label = target.user.alias
        return kind, str(target.user_id), label
    elif model == "ConsultationSession":
        label = f"Сессия {str(target.pk)[:8]}"
    elif model == "Report":
        label = f"Жалоба №{target.pk}"
    else:
        label = str(target)
    return kind, str(target.pk), label[:120]


def audit(request, action: str, target=None, details: dict | None = None, actor=None) -> AuditLog:
    user = actor or getattr(request, "user", None)
    is_user = bool(user is not None and getattr(user, "is_authenticated", False))
    kind, pk, label = _describe(target)
    meta = getattr(request, "META", {}) or {}
    return AuditLog.objects.create(
        actor=user if is_user else None,
        actor_alias=(user.alias if is_user else "")[:40],
        actor_role=(get_staff_role(user) or getattr(user, "role", "") or "") if is_user else "",
        action=action[:60],
        target_type=kind[:30],
        target_id=pk[:64],
        target_label=label,
        details=details or {},
        ip=client_ip(request) if request is not None else None,
        user_agent=(meta.get("HTTP_USER_AGENT", "") or "")[:200],
    )
