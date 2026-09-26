"""
Отзывы о специалистах.

Оставить отзыв может только клиент, у которого был хотя бы один завершённый (и оплаченный)
созвон с этим специалистом. Один отзыв на пару клиент–специалист, его можно редактировать.
Публично автор не показывается — только «Клиент, N созвонов». Специалист может ответить один раз
(ответ можно поправить). Модерация — через жалобы (apps.staff Report, target_type="review").
"""
from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

TAGS = {
    "attentive": "Внимательный",
    "clarity": "Помог разобраться",
    "gentle": "Бережный",
    "tools": "Даёт инструменты",
    "progress": "Есть результат",
    "punctual": "Пунктуальный",
    "clear": "Понятно объясняет",
    "safe": "С ним спокойно",
}


class Review(models.Model):
    class Status(models.TextChoices):
        PUBLISHED = "published", "Опубликован"
        HIDDEN = "hidden", "Скрыт модератором"

    psychologist = models.ForeignKey(
        "users.PsychologistProfile", on_delete=models.CASCADE, related_name="reviews"
    )
    client = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reviews_written")
    rating = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    text = models.TextField(max_length=2000, blank=True, default="")
    tags = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PUBLISHED, db_index=True)
    hidden_reason = models.CharField(max_length=500, blank=True, default="")
    hidden_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    reply_text = models.TextField(max_length=1500, blank=True, default="")
    reply_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    edited_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "reviews_review"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["psychologist", "client"], name="review_one_per_client"),
        ]
        indexes = [models.Index(fields=["psychologist", "status", "created_at"])]

    def __str__(self):
        return f"Отзыв №{self.pk} ({self.rating}★)"
