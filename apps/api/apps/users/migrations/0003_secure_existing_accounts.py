"""
Данные: пустые email_hash → NULL (email теперь необязателен) и блокировка
пароля у исторического аккаунта root/root, который создавала старая команда create_admin.
"""
from django.contrib.auth.hashers import check_password, make_password
from django.db import migrations


def forwards(apps, schema_editor):
    User = apps.get_model("users", "User")
    User.objects.filter(email_hash="").update(email_hash=None)
    for user in User.objects.filter(alias="root"):
        if check_password("root", user.password):
            user.password = make_password(None)  # непригодный пароль
            user.save(update_fields=["password"])


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0002_anonymous_auth_and_profile_fields"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
