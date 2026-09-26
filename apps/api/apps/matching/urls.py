from django.urls import path

from .views import MatchView, MatchOptionsView

# /api/v1/matching/
urlpatterns = [
    path("", MatchView.as_view(), name="matching"),
    path("options/", MatchOptionsView.as_view(), name="matching_options"),
]
