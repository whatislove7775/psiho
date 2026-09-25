import json

from django.db import transaction
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from apps.users.permissions import IsPsychologist

from .models import SpecialistPhoto
from .processing import PhotoError, process_photo
from .utils import photo_url


class PhotoUploadThrottle(UserRateThrottle):
    rate = "30/hour"
    scope = "specialist_photo"


class SpecialistPhotoView(APIView):
    """POST — загрузить/заменить фото (multipart: photo, crop?), DELETE — удалить."""

    permission_classes = [IsPsychologist]
    parser_classes = [MultiPartParser, FormParser]

    def get_throttles(self):
        return [PhotoUploadThrottle()] if self.request.method == "POST" else []

    def post(self, request):
        profile = request.user.psychologist_profile
        crop = request.data.get("crop")
        if crop:
            try:
                crop = json.loads(crop) if isinstance(crop, str) else crop
                if not isinstance(crop, dict):
                    raise ValueError
            except ValueError:
                return Response({"detail": "Неверные параметры кадрирования."}, status=400)
        try:
            content = process_photo(request.FILES.get("photo"), crop or None)
        except PhotoError as exc:
            return Response({"detail": str(exc)}, status=400)

        with transaction.atomic():
            photo = SpecialistPhoto.objects.select_for_update().filter(profile=profile).first()
            old_name = photo.image.name if photo and photo.image else None
            if photo is None:
                photo = SpecialistPhoto(profile=profile)
            photo.image.save(content.name, content, save=False)
            photo.save()
        if old_name and old_name != photo.image.name:
            photo.image.storage.delete(old_name)
        profile.photo = photo
        return Response({"photo_url": photo_url(profile)}, status=status.HTTP_200_OK)

    def delete(self, request):
        profile = request.user.psychologist_profile
        photo = SpecialistPhoto.objects.filter(profile=profile).first()
        if photo:
            name = photo.image.name
            photo.delete()
            if name:
                photo.image.storage.delete(name)
        return Response(status=status.HTTP_204_NO_CONTENT)
