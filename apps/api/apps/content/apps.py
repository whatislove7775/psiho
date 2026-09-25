from django.apps import AppConfig


class ContentConfig(AppConfig):
    name = "apps.content"
    label = "content"
    verbose_name = "Статьи и практики"
    default_auto_field = "django.db.models.BigAutoField"
