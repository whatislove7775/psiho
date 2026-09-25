from django.db import migrations


def forwards(apps, schema_editor):
    from apps.content.seed import seed_content

    seed_content(apps.get_model("content", "Article"), apps.get_model("content", "Practice"))


class Migration(migrations.Migration):
    dependencies = [("content", "0001_initial")]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
