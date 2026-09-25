from django.urls import path

from .views import CallFeedbackView, CallPresenceView

urlpatterns = [
    path("<uuid:session_id>/feedback/", CallFeedbackView.as_view()),
    path("<uuid:session_id>/presence/", CallPresenceView.as_view()),
]
