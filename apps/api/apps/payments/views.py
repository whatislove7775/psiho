import json
import logging

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .services import handle_payment_webhook

logger = logging.getLogger(__name__)


class PaymentWebhookView(APIView):
    """
    Вебхук YooKassa. Тело запроса используется только как подсказка (id платежа):
    фактический статус перезапрашивается у API YooKassa (см. services).
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        try:
            payload = json.loads(request.body)
        except (ValueError, TypeError):
            return Response(status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(payload, dict):
            return Response(status=status.HTTP_400_BAD_REQUEST)

        try:
            payment = handle_payment_webhook(payload)
        except Exception:
            logger.exception("Ошибка обработки вебхука YooKassa")
            # не-2xx → YooKassa повторит доставку позже
            return Response(status=status.HTTP_502_BAD_GATEWAY)

        if payment is None:
            # Неизвестный платёж — 200, чтобы YooKassa не ретраила
            return Response(status=status.HTTP_200_OK)
        return Response({"status": payment.status}, status=status.HTTP_200_OK)
