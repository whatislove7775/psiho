from django.urls import path

from . import views as v

# /api/v1/business/
urlpatterns = [
    path("leads/", v.LeadCreateView.as_view()),
    # Клиент
    path("me/", v.MyProgramsView.as_view()),
    path("me/<uuid:pk>/leave/", v.LeaveView.as_view()),
    path("redeem/", v.RedeemView.as_view()),
    # HR компании
    path("portal/me/", v.PortalMeView.as_view()),
    path("portal/me/password/", v.PortalPasswordView.as_view()),
    path("portal/dashboard/", v.PortalDashboardView.as_view()),
    path("portal/codes/", v.PortalCodesView.as_view()),
    path("portal/codes/revoke/", v.PortalCodeRevokeView.as_view()),
    path("portal/codes/<uuid:pk>/export/", v.PortalCodesExportView.as_view()),
    path("portal/codes/<uuid:pk>/revoke/", v.PortalBatchRevokeView.as_view()),
    path("portal/program/", v.PortalProgramView.as_view()),
    path("portal/documents/", v.PortalDocumentsView.as_view()),
    path("portal/documents/invoices/", v.PortalInvoiceRequestView.as_view()),
    path("portal/documents/acts.csv", v.PortalActsCsvView.as_view()),
    # Персонал
    path("staff/companies/", v.StaffCompaniesView.as_view()),
    path("staff/companies/<uuid:pk>/", v.StaffCompanyView.as_view()),
    path("staff/companies/<uuid:pk>/admins/", v.StaffAdminsView.as_view()),
    path("staff/companies/<uuid:pk>/admins/<int:admin_id>/", v.StaffAdminView.as_view()),
    path("staff/companies/<uuid:pk>/programs/", v.StaffProgramsView.as_view()),
    path("staff/companies/<uuid:pk>/codes/", v.StaffCodesView.as_view()),
    path("staff/companies/<uuid:pk>/invoices/", v.StaffInvoicesView.as_view()),
    path("staff/companies/<uuid:pk>/adjust/", v.StaffAdjustView.as_view()),
    path("staff/programs/<uuid:pk>/", v.StaffProgramView.as_view()),
    path("staff/codes/<uuid:pk>/export/", v.StaffCodesExportView.as_view()),
    path("staff/invoices/<uuid:pk>/<str:action>/", v.StaffInvoiceActionView.as_view()),
    path("staff/leads/", v.StaffLeadsView.as_view()),
    path("staff/leads/<uuid:pk>/", v.StaffLeadView.as_view()),
]
