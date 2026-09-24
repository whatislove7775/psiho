from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import UserChangeForm, UserCreationForm

from .models import PsychologistProfile, PsychologistSchedule, User

# Вход в /api/admin/ — по псевдониму или email (apps.users.backends.AliasOrEmailBackend)


class AdminUserCreationForm(UserCreationForm):
    class Meta:
        model = User
        fields = ("alias", "role")


class AdminUserChangeForm(UserChangeForm):
    class Meta:
        model = User
        fields = "__all__"


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    form = AdminUserChangeForm
    add_form = AdminUserCreationForm
    list_display = ("alias", "role", "is_staff", "is_active", "date_joined")
    list_filter = ("role", "is_staff", "is_active")
    search_fields = ("alias",)
    ordering = ("-date_joined",)
    fieldsets = (
        (None, {"fields": ("alias", "password", "email_hash")}),
        ("Профиль", {"fields": ("role", "avatar_config")}),
        ("Права", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Даты", {"fields": ("date_joined", "last_login")}),
    )
    add_fieldsets = (
        (None, {"fields": ("alias", "role", "password1", "password2")}),
    )
    readonly_fields = ("date_joined", "last_login", "email_hash")


@admin.register(PsychologistProfile)
class PsychologistProfileAdmin(admin.ModelAdmin):
    list_display = ("display_name", "verification_status", "session_rate_rub", "created_at")
    list_filter = ("verification_status",)
    search_fields = ("display_name",)
    list_editable = ("verification_status",)
    readonly_fields = ("created_at", "updated_at")
    fieldsets = (
        ("Публичная информация", {"fields": ("user", "display_name", "bio", "approach", "specializations", "languages", "experience_years", "session_rate_rub")}),
        ("Верификация", {"fields": ("verification_status", "verified_by", "verified_at", "rejection_reason")}),
        ("Платежи", {"fields": ("yookassa_account_id",)}),
        ("Даты", {"fields": ("created_at", "updated_at")}),
    )


@admin.register(PsychologistSchedule)
class PsychologistScheduleAdmin(admin.ModelAdmin):
    list_display = ("psychologist", "weekday", "start_time", "end_time", "is_active")
    list_filter = ("is_active", "weekday")
