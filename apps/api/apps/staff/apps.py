from django.apps import AppConfig


class StaffConfig(AppConfig):
    name = "apps.staff"
    label = "staff"
    verbose_name = "Персонал и модерация"

    def ready(self):
        from .system import install_error_counter

        install_error_counter()
