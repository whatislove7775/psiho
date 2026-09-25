from django.contrib import admin

from .models import Article, Practice


@admin.register(Article)
class ArticleAdmin(admin.ModelAdmin):
    list_display = ("title", "topic", "is_published", "published_at")
    list_filter = ("topic", "is_published")
    search_fields = ("title", "summary")
    prepopulated_fields = {"slug": ("title",)}


@admin.register(Practice)
class PracticeAdmin(admin.ModelAdmin):
    list_display = ("title", "kind", "duration_minutes", "is_published", "order")
    list_filter = ("kind", "is_published")
