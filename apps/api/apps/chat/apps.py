from django.apps import AppConfig


class ChatConfig(AppConfig):
    name = "apps.chat"
    label = "chat"
    verbose_name = "Чаты"
    default_auto_field = "django.db.models.BigAutoField"
