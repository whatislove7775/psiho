from django.urls import path

from . import views as v

# /api/v1/staff/
urlpatterns = [
    path("me/", v.StaffMeView.as_view(), name="staff_me"),
    path("me/password/", v.StaffPasswordView.as_view(), name="staff_me_password"),
    path("me/2fa/setup/", v.TotpSetupView.as_view(), name="staff_totp_setup"),
    path("me/2fa/enable/", v.TotpEnableView.as_view(), name="staff_totp_enable"),
    path("me/2fa/disable/", v.TotpDisableView.as_view(), name="staff_totp_disable"),
    path("dashboard/", v.DashboardView.as_view(), name="staff_dashboard"),
    path("users/", v.UserListView.as_view(), name="staff_users"),
    path("users/<str:pk>/", v.UserDetailView.as_view(), name="staff_user"),
    path("users/<str:pk>/block/", v.UserBlockView.as_view(), name="staff_user_block"),
    path("users/<str:pk>/unblock/", v.UserUnblockView.as_view(), name="staff_user_unblock"),
    path("users/<str:pk>/logout/", v.UserLogoutView.as_view(), name="staff_user_logout"),
    path("specialists/", v.SpecialistListView.as_view(), name="staff_specialists"),
    path("specialists/<int:pk>/", v.SpecialistDetailView.as_view(), name="staff_specialist"),
    path("specialists/<int:pk>/decision/", v.SpecialistDecisionView.as_view(), name="staff_specialist_decision"),
    path("sessions/", v.SessionListView.as_view(), name="staff_sessions"),
    path("sessions/<uuid:pk>/", v.SessionDetailView.as_view(), name="staff_session"),
    path("sessions/<uuid:pk>/cancel/", v.SessionCancelView.as_view(), name="staff_session_cancel"),
    path("reports/", v.ReportListView.as_view(), name="staff_reports"),
    path("reports/<int:pk>/assign/", v.ReportAssignView.as_view(), name="staff_report_assign"),
    path("reports/<int:pk>/resolve/", v.ReportResolveView.as_view(), name="staff_report_resolve"),
    path("audit/", v.AuditListView.as_view(), name="staff_audit"),
    path("system/", v.SystemView.as_view(), name="staff_system"),
    path("members/", v.StaffListView.as_view(), name="staff_members"),
    path("members/<str:user_id>/", v.StaffDetailView.as_view(), name="staff_member"),
    path("members/<str:user_id>/deactivate/", v.StaffActionView.as_view(action="deactivate"), name="staff_member_deactivate"),
    path("members/<str:user_id>/activate/", v.StaffActionView.as_view(action="activate"), name="staff_member_activate"),
    path("members/<str:user_id>/reset-password/", v.StaffActionView.as_view(action="reset_password"), name="staff_member_reset_password"),
    path("members/<str:user_id>/reset-2fa/", v.StaffActionView.as_view(action="reset_2fa"), name="staff_member_reset_2fa"),
]
