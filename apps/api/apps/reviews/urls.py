from django.urls import path

from . import views as v

# /api/v1/reviews/
urlpatterns = [
    path("", v.ReviewCreateView.as_view(), name="review_create"),
    path("eligibility/", v.EligibilityView.as_view(), name="review_eligibility"),
    path("about-me/", v.AboutMeView.as_view(), name="review_about_me"),
    path("<int:pk>/", v.ReviewDetailView.as_view(), name="review_detail"),
    path("<int:pk>/reply/", v.ReplyView.as_view(), name="review_reply"),
]

# /api/v1/psychologists/
urlpatterns_public = [
    path("<int:pk>/reviews/", v.PublicReviewsView.as_view(), name="public_reviews"),
]

# /api/v1/staff/reviews/
urlpatterns_staff = [
    path("", v.StaffReviewListView.as_view(), name="staff_reviews"),
    path("<int:pk>/moderate/", v.StaffReviewModerateView.as_view(), name="staff_review_moderate"),
]
