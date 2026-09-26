"""Небольшие личные настройки, которые «переезжают» вместе с аккаунтом на другие устройства.

Сейчас это «Незаметный режим» и «Защита от скриншотов». Храним только то, что
прошло проверку в serializers.clean_settings, — никаких произвольных данных.
"""
from django.conf import settings
from django.db import models


class UserSettings(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="prefs")
    data = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "prefs_user_settings"
        verbose_name = "Настройки пользователя"
        verbose_name_plural = "Настройки пользователей"

    def __str__(self):
        return f"UserSettings({self.user_id})"
