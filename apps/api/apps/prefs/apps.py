from django.apps import AppConfig


class PrefsConfig(AppConfig):
    name = "apps.prefs"
    label = "prefs"
    verbose_name = "Настройки пользователя"
    default_auto_field = "django.db.models.BigAutoField"
