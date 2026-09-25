"""Удаляет сообщения с истёкшим сроком хранения (режим «24 часа»).

Запускается сервисом scheduler в docker-compose каждые несколько минут:
    python manage.py purge_chats
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.chat.models import Message


class Command(BaseCommand):
    help = "Удаляет сообщения чатов с истёкшим сроком хранения"

    def handle(self, *args, **opts):
        now = timezone.now()
        total = 0
        # Пачками, чтобы не держать долгую транзакцию на большом объёме
        while True:
            ids = list(Message.objects.filter(expires_at__lte=now).values_list("pk", flat=True)[:500])
            if not ids:
                break
            Message.objects.filter(pk__in=ids).delete()  # вложения удаляются каскадом
            total += len(ids)
        if total or opts.get("verbosity", 1) > 1:
            self.stdout.write(f"purge_chats: удалено сообщений: {total}")
