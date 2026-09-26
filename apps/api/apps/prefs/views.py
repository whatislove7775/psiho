from rest_framework.response import Response
from rest_framework.views import APIView

from .models import UserSettings
from .schema import clean_settings


def _payload(obj: UserSettings | None) -> dict:
    if obj is None:
        return {"settings": {}, "updated_at": None}
    return {"settings": obj.data, "updated_at": obj.updated_at.isoformat()}


class MySettingsView(APIView):
    """GET/PATCH/DELETE /api/v1/me/settings/ — личные настройки текущего пользователя."""

    def get(self, request):
        return Response(_payload(UserSettings.objects.filter(user=request.user).first()))

    def patch(self, request):
        obj, _ = UserSettings.objects.get_or_create(user=request.user)
        obj.data = clean_settings(request.data, obj.data)
        obj.save(update_fields=["data", "updated_at"])
        return Response(_payload(obj))

    put = patch

    def delete(self, request):
        UserSettings.objects.filter(user=request.user).delete()
        return Response(_payload(None))
