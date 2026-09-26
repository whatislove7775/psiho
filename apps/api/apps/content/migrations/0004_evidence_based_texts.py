from django.db import migrations


def forwards(apps, schema_editor):
    """Upgrade starter articles/practices to the evidence-based versions (sources, key facts,
    «Когда нужен специалист», mechanism and cautions). Only items nobody edited in the CMS are
    touched: a row is replaced when its text still matches a known starter version."""
    from apps.content.seed import seed_content

    seed_content(apps.get_model("content", "Article"), apps.get_model("content", "Practice"), upgrade=True)


class Migration(migrations.Migration):
    dependencies = [("content", "0003_evidence_fields")]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
