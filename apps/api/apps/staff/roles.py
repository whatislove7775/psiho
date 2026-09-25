"""
Роли сотрудников и матрица прав — единственное место, где решается,
кто из персонала что может.

Использование в других приложениях:

    from apps.staff.roles import has_staff_perm
    if has_staff_perm(request.user, "content.edit"): ...

    from apps.staff.permissions import StaffPerm
    permission_classes = [StaffPerm("support.inbox")]

Как определяется роль (get_staff_role):
1. Активная запись StaffMember → её роль.
2. Иначе superuser (ADMIN_LOGIN из create_admin) → owner.
3. Иначе role == "admin" или is_staff → admin (наследие до появления ролей).
4. Иначе пользователь не сотрудник.
"""
from __future__ import annotations

OWNER = "owner"
ADMIN = "admin"
MODERATOR = "moderator"
SUPPORT = "support"
DEVELOPER = "developer"
EDITOR = "editor"

ROLE_CHOICES = [
    (OWNER, "Владелец"),
    (ADMIN, "Администратор"),
    (MODERATOR, "Модератор"),
    (SUPPORT, "Поддержка"),
    (DEVELOPER, "Разработчик"),
    (EDITOR, "Редактор"),
]
ROLE_LABELS = dict(ROLE_CHOICES)
ROLES = [r for r, _ in ROLE_CHOICES]

# Старшинство: сотрудник может управлять только теми, у кого ранг ниже.
RANK = {OWNER: 100, ADMIN: 80, MODERATOR: 40, SUPPORT: 30, DEVELOPER: 30, EDITOR: 20}

ALL = frozenset(ROLES)

# Право → роли, которым оно выдано.
PERMISSIONS: dict[str, frozenset[str]] = {
    "dashboard.view": ALL,
    "dashboard.revenue": frozenset({OWNER, ADMIN}),
    # Пользователи (клиенты анонимны: email/реальные данные не видит никто, кроме владельца)
    "users.view": frozenset({OWNER, ADMIN, MODERATOR, SUPPORT}),
    "users.block": frozenset({OWNER, ADMIN, MODERATOR}),
    "users.logout": frozenset({OWNER, ADMIN, MODERATOR, SUPPORT}),
    "users.identity": frozenset({OWNER}),
    # Специалисты
    "specialists.view": frozenset({OWNER, ADMIN, MODERATOR, SUPPORT}),
    "specialists.verify": frozenset({OWNER, ADMIN}),
    "specialists.edit": frozenset({OWNER, ADMIN}),
    "specialists.suspend": frozenset({OWNER, ADMIN, MODERATOR}),
    # Сессии и деньги
    "sessions.view": frozenset({OWNER, ADMIN, SUPPORT}),
    "sessions.cancel": frozenset({OWNER, ADMIN, SUPPORT}),
    "sessions.refund": frozenset({OWNER, ADMIN}),
    # Модерация жалоб
    "reports.view": frozenset({OWNER, ADMIN, MODERATOR}),
    "reports.resolve": frozenset({OWNER, ADMIN, MODERATOR}),
    # Контент (статьи, практики — A1) и поддержка (A4)
    "content.edit": frozenset({OWNER, ADMIN, EDITOR}),
    "content.publish": frozenset({OWNER, ADMIN, EDITOR}),
    # Переписка поддержки. Личные чаты клиент↔специалист персоналу не доступны никогда.
    "support.inbox": frozenset({OWNER, ADMIN, SUPPORT}),
    "support.reply": frozenset({OWNER, ADMIN, SUPPORT}),
    # Журнал и система
    "audit.view": frozenset({OWNER, ADMIN, DEVELOPER}),
    "system.view": frozenset({OWNER, ADMIN, DEVELOPER}),
    # Персонал
    "staff.view": frozenset({OWNER, ADMIN}),
    "staff.manage": frozenset({OWNER, ADMIN}),
}

PERMISSION_LABELS = {
    "dashboard.view": "Сводка",
    "dashboard.revenue": "Оборот и выручка",
    "users.view": "Просмотр пользователей",
    "users.block": "Блокировка пользователей",
    "users.logout": "Завершение сеансов пользователей",
    "users.identity": "Служебные данные аккаунтов",
    "specialists.view": "Просмотр специалистов",
    "specialists.verify": "Проверка заявок специалистов",
    "specialists.edit": "Редактирование профилей специалистов",
    "specialists.suspend": "Приостановка специалистов",
    "sessions.view": "Просмотр сессий",
    "sessions.cancel": "Отмена сессий",
    "sessions.refund": "Возвраты",
    "reports.view": "Просмотр жалоб",
    "reports.resolve": "Решения по жалобам",
    "content.edit": "Редактирование материалов",
    "content.publish": "Публикация материалов",
    "support.inbox": "Обращения в поддержку",
    "support.reply": "Ответы в поддержке",
    "audit.view": "Журнал действий",
    "system.view": "Состояние системы",
    "staff.view": "Список сотрудников",
    "staff.manage": "Управление сотрудниками",
}

# Для этих ролей двухфакторная защита обязательна, если STAFF_REQUIRE_2FA включён.
TOTP_REQUIRED_ROLES = frozenset({OWNER, ADMIN})


def get_staff_role(user) -> str | None:
    """Роль сотрудника или None. Результат кэшируется на объекте пользователя."""
    if user is None or not getattr(user, "is_authenticated", False) or not getattr(user, "is_active", False):
        return None
    cached = getattr(user, "_staff_role_cache", "__unset__")
    if cached != "__unset__":
        return cached
    role = _resolve_role(user)
    try:
        user._staff_role_cache = role
    except AttributeError:  # pragma: no cover
        pass
    return role


def _resolve_role(user) -> str | None:
    from .models import StaffMember

    member = StaffMember.objects.filter(user_id=user.pk).only("role", "is_active").first()
    if member is not None:
        return member.role if member.is_active else None
    if getattr(user, "is_superuser", False):
        return OWNER
    if getattr(user, "role", None) == "admin" or getattr(user, "is_staff", False):
        return ADMIN
    return None


def forget_staff_role(user) -> None:
    if hasattr(user, "_staff_role_cache"):
        del user._staff_role_cache


def is_staff_member(user) -> bool:
    return get_staff_role(user) is not None


def role_has_perm(role: str | None, perm: str) -> bool:
    if role is None:
        return False
    if perm not in PERMISSIONS:
        raise KeyError(f"Неизвестное право персонала: {perm}")
    return role in PERMISSIONS[perm]


def has_staff_perm(user, perm: str) -> bool:
    """Главная проверка: есть ли у пользователя право `perm` (например "content.edit")."""
    return role_has_perm(get_staff_role(user), perm)


def staff_permissions(user) -> list[str]:
    role = get_staff_role(user)
    return sorted(p for p, roles in PERMISSIONS.items() if role in roles) if role else []


def can_manage_role(actor_role: str | None, target_role: str | None) -> bool:
    """Владелец управляет всеми, кроме владельцев; администратор — только ролями ниже себя."""
    if actor_role not in (OWNER, ADMIN) or target_role is None:
        return False
    if target_role == OWNER:
        return False
    return RANK[actor_role] > RANK[target_role]
