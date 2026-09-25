from rest_framework.permissions import SAFE_METHODS, BasePermission


def can_manage_content(user) -> bool:
    """Single place that decides who may edit articles/practices.

    Delegates to the staff role matrix ("content.edit": owner, admin, editor) when
    the staff app is available; falls back to is_staff / legacy admin role."""
    if not (user and user.is_authenticated):
        return False
    try:
        from apps.staff.roles import has_staff_perm
    except ImportError:  # pragma: no cover - staff app not installed
        return bool(user.is_staff or getattr(user, "role", None) == "admin")
    return has_staff_perm(user, "content.edit")


class IsContentStaff(BasePermission):
    message = "Редактировать материалы могут только сотрудники с правом на материалы."

    def has_permission(self, request, view):
        return can_manage_content(request.user)


class ReadOnlyOrContentStaff(BasePermission):
    def has_permission(self, request, view):
        return request.method in SAFE_METHODS or can_manage_content(request.user)
