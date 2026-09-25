from django.urls import path

from .views import MyReportsView, ReportCreateView

# /api/v1/reports/
urlpatterns = [
    path("", ReportCreateView.as_view(), name="report_create"),
    path("mine/", MyReportsView.as_view(), name="report_mine"),
]
