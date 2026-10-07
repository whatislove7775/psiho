from django.db import migrations, models
class Migration(migrations.Migration):
    dependencies = [("availability", "0003_intro_call")]
    operations = [
        migrations.AddField("availabilitysettings", "couples_enabled", models.BooleanField(default=False)),
        migrations.AddField("availabilitysettings", "couples_minutes", models.PositiveSmallIntegerField(default=80)),
        migrations.AddField("availabilitysettings", "couples_price_rub", models.PositiveIntegerField(default=5000)),
    ]
