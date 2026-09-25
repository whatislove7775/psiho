from django.urls import path

from .views import AvailableStartsView

# /api/v1/psychologists/
urlpatterns = [
    path("<int:pk>/available-starts/", AvailableStartsView.as_view(), name="psychologist_available_starts"),
]
