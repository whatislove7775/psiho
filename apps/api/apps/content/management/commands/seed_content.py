from django.core.management.base import BaseCommand

from apps.content.models import Article, Practice
from apps.content.seed import seed_content


class Command(BaseCommand):
    help = "Create starter psychology articles and practices (idempotent, by slug)."

    def add_arguments(self, parser):
        parser.add_argument("--overwrite", action="store_true", help="Reset existing seeded items to the starter text.")

    def handle(self, *args, overwrite=False, **options):
        a, p = seed_content(Article, Practice, overwrite=overwrite)
        self.stdout.write(self.style.SUCCESS(f"Articles created: {a}, practices created: {p}"))
