from django.urls import path

from .views import PsychologistDetailView, PsychologistListView, PsychologistSlotsView

# /api/v1/psychologists/
urlpatterns = [
    path("", PsychologistListView.as_view(), name="psychologist_list"),
    path("<int:pk>/", PsychologistDetailView.as_view(), name="psychologist_detail"),
    path("<int:pk>/slots/", PsychologistSlotsView.as_view(), name="psychologist_slots"),
]
