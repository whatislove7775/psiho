"""«В топе» (ручное закрепление) → «Выбор редакции» (значок + буст в ranking.py).

Статьи, которые сотрудники закрепляли в топе, остаются отмеченными — теперь как выбор редакции."""
from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("content", "0007_rich_content_topics_ratings")]

    operations = [
        migrations.RenameField("article", "is_featured", "editors_choice"),
    ]
