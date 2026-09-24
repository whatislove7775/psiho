from django.urls import path

from .views import (
    AdminPsychologistListView, AdminSessionListView, AdminStatsView, AdminVerifyPsychologistView,
)

# /api/v1/admin-panel/
urlpatterns = [
    path("psychologists/", AdminPsychologistListView.as_view(), name="admin_psychologists"),
    path("psychologists/<int:pk>/verify/", AdminVerifyPsychologistView.as_view(), name="admin_verify"),
    path("stats/", AdminStatsView.as_view(), name="admin_stats"),
    path("sessions/", AdminSessionListView.as_view(), name="admin_sessions"),
]
