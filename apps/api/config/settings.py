import logging
from datetime import timedelta
from pathlib import Path

import environ

env = environ.Env(DEBUG=(bool, False))
BASE_DIR = Path(__file__).resolve().parent.parent
environ.Env.read_env(BASE_DIR / ".env")

_INSECURE_KEY = "django-insecure-set-SECRET_KEY-env-var-in-production"
SECRET_KEY = env("SECRET_KEY", default=_INSECURE_KEY)
DEBUG = env("DEBUG")
if SECRET_KEY == _INSECURE_KEY and not DEBUG:
    logging.getLogger(__name__).warning("SECRET_KEY не задан — используется небезопасный ключ по умолчанию")

ALLOWED_HOSTS = env.list(
    "ALLOWED_HOSTS",
    default=["localhost", "127.0.0.1", "aprosop.ru", "www.aprosop.ru"],
)

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "channels",
    "apps.users",
    "apps.sessions",
    "apps.payments",
    "apps.signaling",
    "apps.availability",
    "apps.content",
    "apps.photos",
    "apps.chat",
    "apps.staff",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    }
]

STATIC_URL = "/api/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
# Uploaded files (specialist photos). Production: docker volume "media", served by nginx at /media/.
MEDIA_URL = "/media/"
MEDIA_ROOT = env("MEDIA_ROOT", default=str(BASE_DIR / "media"))
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

_use_postgres = env.bool("USE_POSTGRES", default=False)

if _use_postgres:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": env("DB_NAME", default="anonpsy"),
            "USER": env("DB_USER", default="postgres"),
            "PASSWORD": env("DB_PASSWORD", default=""),
            "HOST": env("DB_HOST", default="localhost"),
            "PORT": env("DB_PORT", default="5432"),
        }
    }
else:
    # SQLite по умолчанию — для локальной разработки без PostgreSQL
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": env("SQLITE_PATH", default=str(BASE_DIR / "db.sqlite3")),
        }
    }

_redis_url = env("REDIS_URL", default="")

if _redis_url:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {"hosts": [_redis_url]},
        }
    }
else:
    # In-memory channel layer для локальной разработки без Redis
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        }
    }

if _redis_url:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": _redis_url,
            "KEY_PREFIX": "aprosop",
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "aprosop",
        }
    }

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        # JWT + мгновенный отзыв токенов при принудительном выходе/блокировке (apps.staff)
        "apps.staff.authentication.RevocableJWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_RENDERER_CLASSES": ("rest_framework.renderers.JSONRenderer",),
    "DEFAULT_THROTTLE_RATES": {
        # Регистрация / вход / восстановление — защита от перебора
        "auth": env("AUTH_THROTTLE_RATE", default="20/min"),
    },
}

AUTHENTICATION_BACKENDS = ["apps.users.backends.AliasOrEmailBackend"]

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=2),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": env("JWT_SECRET_KEY", default=SECRET_KEY),
    "AUTH_HEADER_TYPES": ("Bearer",),
}

CORS_ALLOWED_ORIGINS = env.list(
    "CORS_ALLOWED_ORIGINS",
    default=[
        "https://aprosop.ru",
        "https://www.aprosop.ru",
        "http://localhost:3000",
    ],
)
CORS_ALLOW_CREDENTIALS = True

# Django 4.0+: CSRF checks Origin header against this list
CSRF_TRUSTED_ORIGINS = env.list(
    "CSRF_TRUSTED_ORIGINS",
    default=[
        "http://localhost",
        "http://127.0.0.1",
        "http://155.212.128.231",
        "http://aprosop.ru",
        "https://aprosop.ru",
        "http://www.aprosop.ru",
        "https://www.aprosop.ru",
    ],
)

YOOKASSA_SHOP_ID = env("YOOKASSA_SHOP_ID", default="")
YOOKASSA_SECRET_KEY = env("YOOKASSA_SECRET_KEY", default="")
YOOKASSA_RETURN_URL = env("YOOKASSA_RETURN_URL", default="https://aprosop.ru/sessions")

# Соль для хеширования email. Старые аккаунты (legacy-константа) продолжают
# входить: поиск идёт по обоим хешам, см. apps/users/security.py
EMAIL_HASH_SALT = env("EMAIL_HASH_SALT", default="ANON_PSY_EMAIL_SALT_v1")

# Расписание психологов задаётся в московском времени
SCHEDULE_TIME_ZONE = env("SCHEDULE_TIME_ZONE", default="Europe/Moscow")

# Процент комиссии платформы (20%)
PLATFORM_FEE_PERCENT = env.float("PLATFORM_FEE_PERCENT", default=20.0)

AUTH_USER_MODEL = "users.User"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
LANGUAGE_CODE = "ru-ru"
TIME_ZONE = "UTC"
USE_TZ = True

# За nginx с TLS-терминацией
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
X_FRAME_OPTIONS = "DENY"
SECURE_CONTENT_TYPE_NOSNIFF = True

TEST_RUNNER = "config.test_runner.PytestTestRunner"
