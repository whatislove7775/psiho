"""Существующие суперпользователи становятся владельцами, role=admin — администраторами."""
from django.db import migrations
from django.db.models import Q


def forwards(apps, schema_editor):
    User = apps.get_model("users", "User")
    StaffMember = apps.get_model("staff", "StaffMember")
    for user in User.objects.filter(Q(is_superuser=True) | Q(role="admin") | Q(is_staff=True)):
        if StaffMember.objects.filter(user=user).exists():
            continue
        StaffMember.objects.create(user=user, role="owner" if user.is_superuser else "admin")


class Migration(migrations.Migration):
    dependencies = [("staff", "0001_initial"), ("users", "0003_secure_existing_accounts")]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
