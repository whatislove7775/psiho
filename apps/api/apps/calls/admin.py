from django.contrib import admin

from .models import CallFeedback


@admin.register(CallFeedback)
class CallFeedbackAdmin(admin.ModelAdmin):
    list_display = ("created_at", "kind", "rating", "role", "session")
    list_filter = ("kind", "rating", "role")
    readonly_fields = ("session", "author", "role", "kind", "rating", "issues", "comment", "tech", "created_at")
