from django.urls import path

from .views import (
    BookSessionView, CancelSessionView, CompleteSessionView, JoinSessionView,
    SessionDetailView, SessionListView,
)

# /api/v1/sessions/
urlpatterns = [
    path("", SessionListView.as_view(), name="session_list"),
    path("book/", BookSessionView.as_view(), name="session_book"),
    path("<uuid:pk>/", SessionDetailView.as_view(), name="session_detail"),
    path("<uuid:pk>/cancel/", CancelSessionView.as_view(), name="session_cancel"),
    path("<uuid:pk>/join/", JoinSessionView.as_view(), name="session_join"),
    path("<uuid:pk>/complete/", CompleteSessionView.as_view(), name="session_complete"),
]
