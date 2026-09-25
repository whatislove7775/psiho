from django.conf import settings
from django.db import models


class CallFeedback(models.Model):
    """A participant's rating of a call and/or a problem report (no media, no message contents).

    `tech` holds only connection numbers from the browser (RTT, loss, codec,
    fps, detector backend) so staff can tell network trouble from device trouble.
    """

    ISSUES = (
        "no_audio", "echo", "voice_breaks", "no_video", "video_freezes",
        "avatar_lags", "avatar_wrong", "voice_filter", "disconnects", "other",
    )

    session = models.ForeignKey("consultations.ConsultationSession", on_delete=models.CASCADE, related_name="call_feedback")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    role = models.CharField(max_length=16)  # client | psychologist
    kind = models.CharField(max_length=16, default="rating")  # rating | problem
    rating = models.PositiveSmallIntegerField(null=True, blank=True)  # 1…5
    issues = models.JSONField(default=list, blank=True)
    comment = models.TextField(blank=True, max_length=1000)
    tech = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["session", "created_at"])]

    def __str__(self):
        return f"{self.kind} {self.rating or ''} {self.session_id}"
