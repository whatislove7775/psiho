from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
class Migration(migrations.Migration):
    dependencies = [("circles", "0002_cohost_capacity"), migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.AddField("circle", "kind", models.CharField(max_length=8, default="group", choices=[("group", "Группа"), ("couple", "Пара")], db_index=True)),
        migrations.AddField("circle", "booked_by", models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=django.db.models.deletion.SET_NULL, related_name="couple_bookings")),
        migrations.AddField("circle", "partner_invite_hash", models.CharField(max_length=64, blank=True, default="")),
    ]
