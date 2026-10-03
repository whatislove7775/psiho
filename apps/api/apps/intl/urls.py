from django.urls import path

from .views import RatesView

# /api/v1/intl/
urlpatterns = [
    path("rates/", RatesView.as_view(), name="intl_rates"),
]
