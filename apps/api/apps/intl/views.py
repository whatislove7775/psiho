from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from . import rates


class RatesView(APIView):
    """GET → {date, source, rub_per: {USD: 91.2, …}} — курсы ЦБ РФ для подсказки цены в валюте страны."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        resp = Response(rates.current())
        resp["Cache-Control"] = "public, max-age=3600"
        return resp
