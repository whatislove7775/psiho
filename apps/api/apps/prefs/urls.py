from django.urls import path

from . import views

# /api/v1/me/
urlpatterns = [
    path("settings/", views.MySettingsView.as_view(), name="my_settings"),
]
