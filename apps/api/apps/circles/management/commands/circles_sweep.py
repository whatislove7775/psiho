from django.core.management.base import BaseCommand

from apps.circles.services import sweep


class Command(BaseCommand):
    help = "Круги: расчёт прошедших встреч, статусы кругов, удаление исчезающих сообщений."

    def handle(self, *args, **options):
        self.stdout.write(str(sweep()))
