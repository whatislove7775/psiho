from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    AnonymousSignupView, ChangePasswordView, DeleteAccountView, LoginView, MeView,
    PsychologistRegisterView, RecoverView,
)

# /api/v1/auth/
urlpatterns = [
    path("anonymous/", AnonymousSignupView.as_view(), name="auth_anonymous"),
    path("register/psychologist/", PsychologistRegisterView.as_view(), name="register_psychologist"),
    path("login/", LoginView.as_view(), name="login"),
    path("recover/", RecoverView.as_view(), name="recover"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("me/", MeView.as_view(), name="me"),
    path("me/password/", ChangePasswordView.as_view(), name="me_password"),
    path("me/delete/", DeleteAccountView.as_view(), name="me_delete"),
]
