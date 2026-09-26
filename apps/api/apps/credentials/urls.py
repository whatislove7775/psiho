from django.urls import path

from . import views as v

# /api/v1/psychologist/credentials/
urlpatterns_cabinet = [
    path("", v.MyCredentialsView.as_view(), name="my_credentials"),
    path("files/<uuid:fid>/", v.MyCredentialFileView.as_view(), name="my_credential_file"),
    path("<uuid:pk>/", v.MyCredentialDetailView.as_view(), name="my_credential"),
    path("<uuid:pk>/files/", v.MyCredentialFilesView.as_view(), name="my_credential_files"),
    path("<uuid:pk>/notes/", v.MyCredentialNotesView.as_view(), name="my_credential_notes"),
]

# /api/v1/credentials/
urlpatterns_files = [
    path("files/<uuid:fid>/", v.CredentialFileContentView.as_view(), name="credential_file"),
]

# /api/v1/psychologists/
urlpatterns_public = [
    path("<int:pk>/credentials/", v.PublicCredentialsView.as_view(), name="public_credentials"),
    path("<int:pk>/credentials/files/<uuid:fid>/", v.PublicCredentialFileView.as_view(),
         name="public_credential_file"),
]

# /api/v1/staff/credentials/
urlpatterns_staff = [
    path("", v.StaffCredentialListView.as_view(), name="staff_credentials"),
    path("<uuid:pk>/", v.StaffCredentialDetailView.as_view(), name="staff_credential"),
]
