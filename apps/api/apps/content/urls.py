from django.urls import path

from . import authoring, views

# /api/v1/content/
urlpatterns = [
    path("topics/", views.TopicListView.as_view(), name="content_topics"),
    path("articles/", views.ArticleListView.as_view(), name="article_list"),
    path("articles/<slug:slug>/", views.ArticleDetailView.as_view(), name="article_detail"),
    path("articles/<slug:slug>/read/", authoring.ArticleReadView.as_view(), name="article_read"),
    path("articles/<slug:slug>/rating/", authoring.ArticleRatingView.as_view(), name="article_rating"),
    path("practices/", views.PracticeListView.as_view(), name="practice_list"),
    path("practices/<slug:slug>/", views.PracticeDetailView.as_view(), name="practice_detail"),
    path("manage/articles/", views.ManageArticleListView.as_view(), name="manage_articles"),
    path("manage/articles/<int:pk>/", views.ManageArticleDetailView.as_view(), name="manage_article"),
    path("manage/articles/<int:pk>/moderate/", authoring.ModerateArticleView.as_view(), name="moderate_article"),
    path("manage/articles/<int:pk>/feature/", authoring.FeatureArticleView.as_view(), name="feature_article"),
    # Статьи специалистов (кабинет /pro/articles) и обложки
    path("my/articles/", authoring.MyArticleListView.as_view(), name="my_articles"),
    path("my/articles/<int:pk>/", authoring.MyArticleDetailView.as_view(), name="my_article"),
    path("my/articles/<int:pk>/submit/", authoring.MyArticleSubmitView.as_view(), name="my_article_submit"),
    path("my/articles/<int:pk>/withdraw/", authoring.MyArticleWithdrawView.as_view(), name="my_article_withdraw"),
    path("covers/", authoring.CoverUploadView.as_view(), name="article_cover_upload"),
    path("images/", authoring.ImageUploadView.as_view(), name="article_image_upload"),
    path("manage/practices/", views.ManagePracticeListView.as_view(), name="manage_practices"),
    path("manage/practices/<int:pk>/", views.ManagePracticeDetailView.as_view(), name="manage_practice"),
]
