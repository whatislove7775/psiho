from django.apps import AppConfig


class MatchingConfig(AppConfig):
    name = "apps.matching"
    label = "matching"
    verbose_name = "Подбор специалиста по анкете"
    default_auto_field = "django.db.models.BigAutoField"
