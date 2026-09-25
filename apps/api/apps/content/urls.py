from django.urls import path

from . import views

# /api/v1/content/
urlpatterns = [
    path("topics/", views.TopicListView.as_view(), name="content_topics"),
    path("articles/", views.ArticleListView.as_view(), name="article_list"),
    path("articles/<slug:slug>/", views.ArticleDetailView.as_view(), name="article_detail"),
    path("practices/", views.PracticeListView.as_view(), name="practice_list"),
    path("practices/<slug:slug>/", views.PracticeDetailView.as_view(), name="practice_detail"),
    path("manage/articles/", views.ManageArticleListView.as_view(), name="manage_articles"),
    path("manage/articles/<int:pk>/", views.ManageArticleDetailView.as_view(), name="manage_article"),
    path("manage/practices/", views.ManagePracticeListView.as_view(), name="manage_practices"),
    path("manage/practices/<int:pk>/", views.ManagePracticeDetailView.as_view(), name="manage_practice"),
]
