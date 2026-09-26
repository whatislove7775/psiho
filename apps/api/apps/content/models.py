from django.db import models
from django.utils import timezone


class Topic(models.TextChoices):
    ANXIETY = "anxiety", "Тревога"
    MOOD = "mood", "Настроение"
    STRESS = "stress", "Стресс и выгорание"
    SLEEP = "sleep", "Сон"
    RELATIONSHIPS = "relationships", "Отношения"
    SELF = "self", "Самооценка"
    LOSS = "loss", "Горе и утрата"
    THERAPY = "therapy", "О терапии"


class EvidenceLevel(models.TextChoices):
    """How strong the research behind a text is. Shown as a badge next to the title."""

    STRONG = "strong", "Сильная доказательная база"
    MODERATE = "moderate", "Умеренная доказательная база"
    LIMITED = "limited", "Ограниченные данные"
    PRACTICE = "practice", "Практический опыт"


class Article(models.Model):
    """Psychology article written in Markdown, managed in /admin/content."""

    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=120, unique=True)
    summary = models.CharField(max_length=400, blank=True)
    body = models.TextField(help_text="Markdown")
    topic = models.CharField(max_length=32, choices=Topic.choices, default=Topic.THERAPY)
    tags = models.JSONField(default=list, blank=True)
    # Visual: a pastel tone key from the design tokens (peach, butter, lime, mint, lilac, sky) + emoji
    cover = models.CharField(max_length=16, default="sky")
    emoji = models.CharField(max_length=8, blank=True)
    reading_minutes = models.PositiveSmallIntegerField(default=5)
    author_name = models.CharField(max_length=120, blank=True, default="Редакция aprosop")
    # Evidence-based layer (see docs/API.md, «Материалы»). Citation markers like [1] in `body`
    # and in `key_facts[].refs` point to 1-based positions in `sources`.
    evidence_level = models.CharField(max_length=16, choices=EvidenceLevel.choices, blank=True, default="")
    key_facts = models.JSONField(default=list, blank=True, help_text='[{"text": str, "refs": [int]}]')
    when_to_seek_help = models.TextField(blank=True, default="", help_text="Markdown")
    sources = models.JSONField(
        default=list, blank=True,
        help_text='[{"title", "authors", "year", "publisher", "url", "doi"?, "kind"?}] — only verified links',
    )
    reviewed_at = models.DateField(null=True, blank=True)
    is_published = models.BooleanField(default=False)
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-published_at", "-created_at")

    def save(self, *args, **kwargs):
        if self.is_published and not self.published_at:
            self.published_at = timezone.now()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title


class Practice(models.Model):
    """Self-help exercise. `steps` is a list of {"title", "text", "seconds"?}."""

    class Kind(models.TextChoices):
        BREATHING = "breathing", "Дыхание"
        GROUNDING = "grounding", "Заземление"
        BODY = "body", "Тело"
        JOURNALING = "journaling", "Записи"
        MINDFULNESS = "mindfulness", "Осознанность"

    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=120, unique=True)
    summary = models.CharField(max_length=400, blank=True)
    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.MINDFULNESS)
    duration_minutes = models.PositiveSmallIntegerField(default=5)
    steps = models.JSONField(default=list, blank=True)
    # Optional breathing pattern in seconds: {"inhale": 4, "hold": 7, "exhale": 8, "hold_after": 0, "cycles": 4}
    pattern = models.JSONField(null=True, blank=True)
    cover = models.CharField(max_length=16, default="mint")
    emoji = models.CharField(max_length=8, blank=True)
    order = models.PositiveSmallIntegerField(default=100)
    evidence_level = models.CharField(max_length=16, choices=EvidenceLevel.choices, blank=True, default="")
    mechanism = models.TextField(blank=True, default="", help_text="Markdown: why it works, with [n] citations")
    cautions = models.TextField(blank=True, default="", help_text="Markdown: when to stop or skip")
    sources = models.JSONField(default=list, blank=True)
    reviewed_at = models.DateField(null=True, blank=True)
    is_published = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("order", "id")

    def __str__(self):
        return self.title
