"""Каждая пара «клиент — специалист», у которой уже были сессии, получает диалог (чат пары)."""
from django.db import migrations


def forwards(apps, schema_editor):
    Session = apps.get_model("consultations", "ConsultationSession")
    Conversation = apps.get_model("chat", "Conversation")
    pairs = set(Session.objects.exclude(status="draft").values_list("client_id", "psychologist_profile_id"))
    have = set(Conversation.objects.filter(kind="specialist").values_list("client_id", "specialist_id"))
    for client_id, profile_id in pairs - have:
        Conversation.objects.create(kind="specialist", client_id=client_id, specialist_id=profile_id)


class Migration(migrations.Migration):
    dependencies = [
        ("dialogs", "0001_initial"),
        ("chat", "0001_initial"),
        ("consultations", "0003_unique_active_start"),
    ]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
