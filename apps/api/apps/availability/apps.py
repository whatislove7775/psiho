from django.apps import AppConfig


class AvailabilityConfig(AppConfig):
    name = "apps.availability"
    label = "availability"
    verbose_name = "Расписание специалистов"
    default_auto_field = "django.db.models.BigAutoField"
