from django.contrib import admin

from .models import AvailabilitySettings, DateOverride, TimeOff, WeeklyTemplate


@admin.register(AvailabilitySettings)
class AvailabilitySettingsAdmin(admin.ModelAdmin):
    list_display = ("profile", "time_zone", "min_duration", "max_duration", "hourly_rate_rub", "buffer_minutes")


admin.site.register(WeeklyTemplate)
admin.site.register(DateOverride)
admin.site.register(TimeOff)
