from django.urls import path

from .views import AvailabilityView, CalendarView, OverrideView, TimeOffDetailView, TimeOffListView

# /api/v1/psychologist/availability/
urlpatterns = [
    path("", AvailabilityView.as_view(), name="availability"),
    path("calendar/", CalendarView.as_view(), name="availability_calendar"),
    path("overrides/<str:day>/", OverrideView.as_view(), name="availability_override"),
    path("time-off/", TimeOffListView.as_view(), name="availability_time_off"),
    path("time-off/<int:pk>/", TimeOffDetailView.as_view(), name="availability_time_off_detail"),
]
