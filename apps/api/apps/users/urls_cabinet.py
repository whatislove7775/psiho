from django.urls import path

from .views import PsychologistProfileView, PsychologistScheduleView, PsychologistStatsView

# /api/v1/psychologist/
urlpatterns = [
    path("profile/", PsychologistProfileView.as_view(), name="psychologist_profile"),
    path("schedule/", PsychologistScheduleView.as_view(), name="psychologist_schedule"),
    path("stats/", PsychologistStatsView.as_view(), name="psychologist_stats"),
]
