from django.urls import path

from . import ai_views, views

urlpatterns = [
    path("ws-token/", views.WsTokenView.as_view()),
    path("unread/", views.UnreadView.as_view()),
    path("contacts/", views.ContactsView.as_view()),
    path("conversations/", views.ConversationListView.as_view()),
    path("conversations/<uuid:pk>/", views.ConversationDetailView.as_view()),
    path("conversations/<uuid:pk>/messages/", views.MessageListView.as_view()),
    path("conversations/<uuid:pk>/read/", views.ReadView.as_view()),
    path("conversations/<uuid:pk>/clear/", views.ClearView.as_view()),
    path("messages/<uuid:pk>/", views.MessageDetailView.as_view()),
    path("messages/<uuid:pk>/delete/", views.MessageDeleteView.as_view()),
    path("messages/<uuid:pk>/attachment/", views.AttachmentView.as_view()),
    path("ai/", ai_views.AIStatusView.as_view()),
    path("ai/consent/", ai_views.AIConsentView.as_view()),
    path("ai/reply/", ai_views.AIReplyView.as_view()),
]
