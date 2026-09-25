from django.contrib import admin

from .models import SpecialistPhoto


@admin.register(SpecialistPhoto)
class SpecialistPhotoAdmin(admin.ModelAdmin):
    list_display = ("profile", "updated_at")
    raw_id_fields = ("profile",)
