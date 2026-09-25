from django.urls import path

from . import views

# /api/v1/dialogues/
urlpatterns = [
    path("", views.DialogueListView.as_view(), name="dialogue_list"),
    path("book/", views.BookWithSpecialistView.as_view(), name="dialogue_book"),
    path("<uuid:pk>/", views.DialogueDetailView.as_view(), name="dialogue_detail"),
    path("<uuid:pk>/starts/", views.DialogueStartsView.as_view(), name="dialogue_starts"),
    path("<uuid:pk>/calls/", views.DialogueCallsView.as_view(), name="dialogue_calls"),
    path("<uuid:pk>/calls/<uuid:sid>/reschedule/", views.DialogueCallRescheduleView.as_view()),
    path("<uuid:pk>/calls/<uuid:sid>/cancel/", views.DialogueCallCancelView.as_view()),
    path("<uuid:pk>/proposals/", views.DialogueProposalsView.as_view(), name="dialogue_proposals"),
    path("<uuid:pk>/proposals/<uuid:pid>/accept/", views.DialogueProposalAcceptView.as_view()),
    path("<uuid:pk>/proposals/<uuid:pid>/close/", views.DialogueProposalCloseView.as_view()),
    path("<uuid:pk>/note/", views.DialogueNoteView.as_view(), name="dialogue_note"),
]
