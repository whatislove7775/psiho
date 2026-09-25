import uuid

from django.db import models

from apps.users.models import PsychologistProfile


def _photo_path(instance, filename):
    # Random name: nothing about the specialist leaks through the URL.
    return f"specialists/{uuid.uuid4().hex}.webp"


class SpecialistPhoto(models.Model):
    """Настоящее фото специалиста (квадрат 512×512, WebP, без EXIF).

    Психологи на платформе не анонимны: клиент видит их реальное фото и видео.
    Хранится в MEDIA_ROOT и раздаётся nginx публично по /media/.
    """

    profile = models.OneToOneField(
        PsychologistProfile, on_delete=models.CASCADE, related_name="photo"
    )
    image = models.ImageField(upload_to=_photo_path, width_field="width", height_field="height")
    width = models.PositiveIntegerField(default=0)
    height = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "photos_specialist_photo"
        verbose_name = "Фото специалиста"

    def __str__(self):
        return f"Photo:{self.profile_id}"
