from django.db import migrations
SLUG = "kak-pravilno-delat-sebya-schastlivym-v-epohu-es-ve-ou-364ec"
def hide(apps, schema_editor):
    apps.get_model("content", "Article").objects.filter(slug=SLUG).update(is_published=False)
def restore(apps, schema_editor):
    apps.get_model("content", "Article").objects.filter(slug=SLUG).update(is_published=True)
class Migration(migrations.Migration):
    dependencies=[("content", "0009_article_language_practice_language")]
    operations=[migrations.RunPython(hide,restore)]
