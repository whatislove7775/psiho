"""Согласия, которые нужно уметь доказать (GDPR ст. 7(1), ст. 9(2)(a)): подтверждение возраста 18+
и явное согласие на обработку сведений о здоровье (для пользователей из ЕС/Великобритании).

Храним только факт, время и страну из настроек — никаких личных данных.
"""
from django.conf import settings
from django.db import models


class Consent(models.Model):
    class Kind(models.TextChoices):
        ADULT = "adult", "Подтвердил(а), что есть 18 лет"
        HEALTH_DATA = "health_data", "Явное согласие на обработку сведений о здоровье"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="consents")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    # Страна из настроек в момент согласия (ISO 3166-1 alpha-2; «EU»/«XX» — другие страны)
    country = models.CharField(max_length=2, blank=True, default="")
    # Версия текста, с которым согласились (дата редакции документа)
    version = models.CharField(max_length=20, blank=True, default="")
    given_at = models.DateTimeField(auto_now_add=True)
    withdrawn_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "intl_consent"
        verbose_name = "Согласие"
        verbose_name_plural = "Согласия"
        indexes = [models.Index(fields=["user", "kind"])]

    def __str__(self):
        return f"{self.kind}:{self.user_id}"
