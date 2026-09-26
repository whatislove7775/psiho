from django.urls import path

from .views import (
    PsychologistDetailView, PsychologistFacetsView, PsychologistListView, PsychologistSearchView,
    PsychologistSlotsView,
)

# /api/v1/psychologists/
urlpatterns = [
    path("", PsychologistListView.as_view(), name="psychologist_list"),
    path("search/", PsychologistSearchView.as_view(), name="psychologist_search"),
    path("popular-requests/", PsychologistFacetsView.as_view(), name="psychologist_popular_requests"),
    path("<int:pk>/", PsychologistDetailView.as_view(), name="psychologist_detail"),
    path("<int:pk>/slots/", PsychologistSlotsView.as_view(), name="psychologist_slots"),
]
