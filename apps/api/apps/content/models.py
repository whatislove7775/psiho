import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class Topic(models.TextChoices):
    ANXIETY = "anxiety", "Тревога"
    MOOD = "mood", "Депрессия и настроение"
    STRESS = "stress", "Стресс и выгорание"
    SLEEP = "sleep", "Сон"
    EMOTIONS = "emotions", "Эмоции"
    SELF = "self", "Самооценка"
    RELATIONSHIPS = "relationships", "Отношения"
    FAMILY = "family", "Семья и дети"
    CONFLICTS = "conflicts", "Конфликты"
    BOUNDARIES = "boundaries", "Границы"
    LONELINESS = "loneliness", "Одиночество"
    LOSS = "loss", "Горе и утрата"
    TRAUMA = "trauma", "Травма"
    ADDICTION = "addiction", "Зависимости"
    EATING = "eating", "Пищевое поведение"
    WORK = "work", "Работа и карьера"
    BODY = "body", "Телесность"
    MINDFULNESS = "mindfulness", "Осознанность"
    TEENS = "teens", "Подростки"
    THERAPY = "therapy", "О терапии"


MAX_TOPICS = 3


class EvidenceLevel(models.TextChoices):
    """How strong the research behind a text is. Shown as a badge next to the title."""

    STRONG = "strong", "Сильная доказательная база"
    MODERATE = "moderate", "Умеренная доказательная база"
    LIMITED = "limited", "Ограниченные данные"
    PRACTICE = "practice", "Практический опыт"


def _cover_path(instance, filename):
    # Random name: nothing about the author leaks through the URL.
    return f"covers/{uuid.uuid4().hex}.webp"


class ArticleCover(models.Model):
    """Своя обложка статьи: 16:9, WebP в трёх размерах, без EXIF (см. covers.py).

    Загружается до сохранения статьи (редактор сначала выбирает кадр), поэтому это отдельная
    запись; статья ссылается на неё через Article.cover_image. Раздаётся nginx по /media/."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    image = models.ImageField(upload_to=_cover_path)  # до 1600×900
    image_md = models.ImageField(upload_to=_cover_path)  # 800×450
    image_sm = models.ImageField(upload_to=_cover_path)  # 480×270
    width = models.PositiveIntegerField(default=0)
    height = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "content_article_cover"

    def delete_files(self):
        for f in (self.image, self.image_md, self.image_sm):
            if f and f.name:
                f.storage.delete(f.name)

    def as_json(self):
        return {
            "id": str(self.id),
            "url": self.image.url,
            "md": self.image_md.url,
            "sm": self.image_sm.url,
            "width": self.width,
            "height": self.height,
        }


class Moderation(models.TextChoices):
    """Статус статьи специалиста. У статей редакции — пусто (публикует сам сотрудник)."""

    NONE = "", "Редакция"
    DRAFT = "draft", "Черновик"
    PENDING = "pending", "На модерации"
    APPROVED = "approved", "Опубликована"
    REJECTED = "rejected", "Отклонена"


class Article(models.Model):
    """Psychology article, managed in /admin/content. Текст — очищенный HTML (`content`,
    см. richtext.py); `body` — прежний Markdown, оставлен как резервная копия после миграции 0007.

    Статьи пишут и специалисты (/pro/articles): тогда `specialist` заполнен, а публикует
    статью сотрудник с правом content.publish после модерации (`moderation`)."""

    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=120, unique=True)
    summary = models.CharField(max_length=400, blank=True)
    body = models.TextField(blank=True, default="", help_text="Markdown (до 0007; резервная копия)")
    content = models.TextField(blank=True, default="", help_text="Sanitized HTML (richtext.sanitize_html)")
    # До трёх тем; первая — основная (`topic`: иллюстрация и цвет обложки, «Ещё по теме»)
    topics = models.JSONField(default=list, blank=True)
    topic = models.CharField(max_length=32, choices=Topic.choices, default=Topic.THERAPY)
    tags = models.JSONField(default=list, blank=True)
    # Visual: a pastel tone key from the design tokens (peach, butter, lime, mint, lilac, sky) + emoji
    cover = models.CharField(max_length=16, default="sky")
    emoji = models.CharField(max_length=8, blank=True)
    reading_minutes = models.PositiveSmallIntegerField(default=5)
    author_name = models.CharField(max_length=120, blank=True, default="Редакция Aprosop")
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
    # Своя обложка (картинка); без неё карточка рисует иллюстрацию темы на цвете `cover`
    cover_image = models.ForeignKey(
        ArticleCover, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    # Статьи специалистов
    specialist = models.ForeignKey(
        "users.PsychologistProfile", null=True, blank=True, on_delete=models.SET_NULL, related_name="articles"
    )
    moderation = models.CharField(max_length=10, choices=Moderation.choices, blank=True, default="", db_index=True)
    moderation_comment = models.TextField(max_length=1000, blank=True, default="")
    submitted_at = models.DateTimeField(null=True, blank=True)
    moderated_at = models.DateTimeField(null=True, blank=True)
    moderated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    # «Выбор редакции»: значок + буст в ранжировании (ranking.py); ставит сотрудник с content.publish
    editors_choice = models.BooleanField(default=False, db_index=True)
    # Прочтения (без привязки к читателю) — для ранжирования (ranking.py)
    reads = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-published_at", "-created_at")

    def save(self, *args, **kwargs):
        if self.is_published and not self.published_at:
            self.published_at = timezone.now()
        if self.topics:
            self.topic = self.topics[0]
        elif self.topic:
            self.topics = [self.topic]
        if not self.content and self.body:
            from .richtext import markdown_to_html

            self.content = markdown_to_html(self.body)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title


def _image_path(instance, filename):
    return f"content/{instance.pk.hex}.webp"


def _image_md_path(instance, filename):
    return f"content/{instance.pk.hex}-md.webp"


class ArticleImage(models.Model):
    """Картинка внутри статьи: WebP 1600 и 800 px по ширине, без EXIF (images.py).

    Грузят авторы (сотрудники с content.edit и специалисты); файлы со случайным именем
    раздаются nginx по /media/content/ — как обложки."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    image = models.ImageField(upload_to=_image_path)  # до 1600 по ширине
    image_md = models.ImageField(upload_to=_image_md_path)  # 800
    width = models.PositiveIntegerField(default=0)
    height = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "content_article_image"

    def as_json(self):
        return {"id": str(self.id), "url": self.image.url, "md": self.image_md.url,
                "width": self.width, "height": self.height}


class ArticleRating(models.Model):
    """Оценка статьи 1–5 от вошедшего пользователя (одна на человека, можно изменить).
    Наружу отдаются только среднее и количество — кто как оценил, не видно никому."""

    article = models.ForeignKey(Article, on_delete=models.CASCADE, related_name="ratings")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    stars = models.PositiveSmallIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "content_article_rating"
        constraints = [
            models.UniqueConstraint(fields=("article", "user"), name="uniq_article_rating_user"),
            models.CheckConstraint(check=models.Q(stars__gte=1, stars__lte=5), name="article_rating_1_5"),
        ]


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
