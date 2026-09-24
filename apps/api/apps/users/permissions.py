from rest_framework.permissions import BasePermission


class IsPsychologist(BasePermission):
    message = "Раздел доступен только психологам."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated and user.role == "psychologist"
            and hasattr(user, "psychologist_profile")
        )


class IsPlatformAdmin(BasePermission):
    message = "Раздел доступен только администраторам."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and (user.role == "admin" or user.is_staff))
