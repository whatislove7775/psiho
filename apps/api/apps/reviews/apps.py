from django.apps import AppConfig


class ReviewsConfig(AppConfig):
    name = "apps.reviews"
    label = "reviews"
    verbose_name = "Отзывы о специалистах"
    default_auto_field = "django.db.models.BigAutoField"
