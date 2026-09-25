from django.urls import path

from .views import SpecialistPhotoView

# /api/v1/psychologist/photo/
urlpatterns = [
    path("", SpecialistPhotoView.as_view(), name="psychologist_photo"),
]
