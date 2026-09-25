from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def health(request):
    from django.db import connection
    try:
        connection.ensure_connection()
        db = "ok"
    except Exception:
        db = "unavailable"
    return JsonResponse({"status": "ok", "db": db})


urlpatterns = [
    path("api/admin/", admin.site.urls),
    path("api/v1/health/", health),
    path("api/v1/auth/", include("apps.users.urls")),
    path("api/v1/psychologists/", include("apps.availability.urls_public")),
    path("api/v1/psychologists/", include("apps.users.urls_psychologists")),
    path("api/v1/psychologist/availability/", include("apps.availability.urls_cabinet")),
    path("api/v1/psychologist/", include("apps.users.urls_cabinet")),
    path("api/v1/psychologist/photo/", include("apps.photos.urls")),
    path("api/v1/sessions/", include("apps.sessions.urls")),
    path("api/v1/admin-panel/", include("apps.adminpanel.urls")),
    path("api/v1/staff/", include("apps.staff.urls")),
    path("api/v1/reports/", include("apps.staff.urls_reports")),
    path("api/v1/payments/", include("apps.payments.urls")),
    path("api/v1/content/", include("apps.content.urls")),
    path("api/v1/chat/", include("apps.chat.urls")),
    path("api/v1/lab/", include("apps.lab.urls")),
]

if settings.DEBUG:  # production: nginx serves /media/ from the "media" volume
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
