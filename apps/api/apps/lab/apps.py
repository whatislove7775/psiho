from django.apps import AppConfig


class LabConfig(AppConfig):
    name = "apps.lab"
    label = "lab"
    verbose_name = "Лаборатория (тестовые звонки)"
    default_auto_field = "django.db.models.BigAutoField"
