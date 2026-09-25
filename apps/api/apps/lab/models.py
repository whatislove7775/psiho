"""
Тестовые комнаты «Лаборатории» персонала.

Отдельная лёгкая модель, а не ConsultationSession: тестовая комната не связана
ни с клиентом, ни со специалистом, ни с платежом, поэтому она по построению не
попадает в статистику, выручку, выплаты, списки специалистов и сводки.
Комната живёт TEST_ROOM_TTL (2 часа) или до ручного закрытия.
"""
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone

TEST_ROOM_TTL = timedelta(hours=2)


def _default_expiry():
    return timezone.now() + TEST_ROOM_TTL


class TestRoomQuerySet(models.QuerySet):
    def active(self):
        return self.filter(closed_at__isnull=True, expires_at__gt=timezone.now())


class TestRoom(models.Model):
    # pytest не должен принимать модель за тестовый класс
    __test__ = False

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # Канал сигналинга. Отдельный UUID, чтобы id комнаты в ссылке не совпадал с каналом.
    webrtc_room_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    label = models.CharField(max_length=80, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+"
    )
    # Аватар «клиента» в тестовом звонке (из песочницы аватаров). Пусто — случайный.
    client_avatar = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(default=_default_expiry)
    closed_at = models.DateTimeField(null=True, blank=True)

    objects = TestRoomQuerySet.as_manager()

    class Meta:
        db_table = "lab_test_room"
        verbose_name = "Тестовая комната"
        verbose_name_plural = "Тестовые комнаты"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Тестовая комната {str(self.id)[:8]}"

    @property
    def is_active(self) -> bool:
        return self.closed_at is None and self.expires_at > timezone.now()
