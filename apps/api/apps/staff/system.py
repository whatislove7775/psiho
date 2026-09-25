"""Состояние системы для роли «разработчик»: БД, кэш/Redis, channel layer,
версия, миграции и счётчик серверных ошибок (без текста запросов и данных)."""
import asyncio
import json
import logging
import os
import platform
import time
from datetime import datetime, timedelta, timezone as dt_timezone
from pathlib import Path

import django
from asgiref.sync import async_to_sync
from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.utils import timezone

STARTED_AT = time.time()
ERROR_BUCKET_TTL = 60 * 60 * 25
LAST_ERRORS_KEY = "staff:errors:last"


def _bucket_key(dt: datetime) -> str:
    return f"staff:errors:{dt:%Y%m%d%H}"


class ErrorCounterHandler(logging.Handler):
    """Считает ERROR из django.request по часам. Сохраняет только путь без query и класс ошибки."""

    def __init__(self):
        super().__init__(level=logging.ERROR)

    def emit(self, record):
        try:
            key = _bucket_key(timezone.now())
            if not cache.add(key, 1, ERROR_BUCKET_TTL):
                try:
                    cache.incr(key)
                except ValueError:
                    cache.set(key, 1, ERROR_BUCKET_TTL)
            request = getattr(record, "request", None)
            path = getattr(request, "path", "") if request is not None else ""
            exc = record.exc_info[1].__class__.__name__ if record.exc_info and record.exc_info[1] else ""
            last = cache.get(LAST_ERRORS_KEY) or []
            last.insert(0, {
                "at": timezone.now().isoformat(),
                "path": str(path)[:120],
                "status": getattr(record, "status_code", None),
                "error": exc[:80],
            })
            cache.set(LAST_ERRORS_KEY, last[:10], ERROR_BUCKET_TTL)
        except Exception:  # никогда не ломаем логирование
            pass


def install_error_counter() -> None:
    logger = logging.getLogger("django.request")
    if not any(isinstance(h, ErrorCounterHandler) for h in logger.handlers):
        logger.addHandler(ErrorCounterHandler())


def errors_last_24h() -> dict:
    now = timezone.now()
    keys = [_bucket_key(now - timedelta(hours=h)) for h in range(24)]
    values = cache.get_many(keys)
    hourly = [int(values.get(k) or 0) for k in reversed(keys)]
    return {"total": sum(hourly), "hourly": hourly, "recent": cache.get(LAST_ERRORS_KEY) or []}


def _timed(fn):
    start = time.perf_counter()
    try:
        detail = fn()
        return {"status": "ok", "latency_ms": round((time.perf_counter() - start) * 1000, 1), **(detail or {})}
    except Exception as exc:
        return {"status": "error", "latency_ms": round((time.perf_counter() - start) * 1000, 1),
                "error": exc.__class__.__name__}


def check_db():
    def run():
        with connection.cursor() as cur:
            cur.execute("SELECT 1")
            cur.fetchone()
        return {"engine": connection.vendor}
    return _timed(run)


def check_cache():
    backend = settings.CACHES["default"]["BACKEND"].rsplit(".", 1)[-1]

    def run():
        key = "staff:health:ping"
        cache.set(key, "pong", 10)
        if cache.get(key) != "pong":
            raise RuntimeError("cache roundtrip")
        return {"backend": backend, "redis": "Redis" in backend}
    return _timed(run)


def check_channels():
    from channels.layers import get_channel_layer

    def run():
        layer = get_channel_layer()
        if layer is None:
            raise RuntimeError("no layer")

        async def roundtrip():
            channel = await layer.new_channel()
            await layer.send(channel, {"type": "health.ping"})
            msg = await asyncio.wait_for(layer.receive(channel), timeout=2)
            if msg.get("type") != "health.ping":
                raise RuntimeError("bad message")

        async_to_sync(roundtrip)()
        return {"backend": layer.__class__.__name__}
    return _timed(run)


def migrations_status():
    from django.db.migrations.executor import MigrationExecutor

    try:
        executor = MigrationExecutor(connection)
        plan = executor.migration_plan(executor.loader.graph.leaf_nodes())
        pending = [f"{m.app_label}.{m.name}" for m, _ in plan]
        applied = len(executor.loader.applied_migrations)
        return {"status": "ok" if not pending else "pending", "pending": pending[:20],
                "pending_count": len(pending), "applied_count": applied}
    except Exception as exc:
        return {"status": "error", "error": exc.__class__.__name__, "pending": [], "pending_count": 0}


def version_info() -> dict:
    """GIT_COMMIT / APP_VERSION из окружения или файла BUILD_INFO(.json), записанного при сборке."""
    commit = os.environ.get("GIT_COMMIT", "").strip()
    version = os.environ.get("APP_VERSION", "").strip()
    built_at = os.environ.get("BUILD_TIME", "").strip()
    base = Path(settings.BASE_DIR)
    for candidate in (base / "BUILD_INFO.json", base / "BUILD_INFO"):
        if commit or not candidate.exists():
            continue
        try:
            raw = candidate.read_text(encoding="utf-8").strip()
            if candidate.suffix == ".json":
                info = json.loads(raw)
                commit = str(info.get("commit", ""))
                version = version or str(info.get("version", ""))
                built_at = built_at or str(info.get("built_at", ""))
            else:
                commit = raw.splitlines()[0] if raw else ""
        except Exception:
            pass
    if not commit:
        commit = _git_head(base)
    return {
        "commit": commit[:40] or None,
        "commit_short": commit[:7] or None,
        "version": version or None,
        "built_at": built_at or None,
        "python": platform.python_version(),
        "django": django.get_version(),
        "debug": bool(settings.DEBUG),
        "started_at": datetime.fromtimestamp(STARTED_AT, tz=dt_timezone.utc).isoformat(),
        "uptime_seconds": int(time.time() - STARTED_AT),
    }


def _git_head(base: Path) -> str:
    """Локальная разработка: читаем .git/HEAD без запуска git."""
    for parent in [base, *base.parents][:4]:
        head = parent / ".git" / "HEAD"
        if not head.exists():
            continue
        try:
            ref = head.read_text().strip()
            if ref.startswith("ref: "):
                ref_path = parent / ".git" / ref[5:]
                if ref_path.exists():
                    return ref_path.read_text().strip()
                packed = parent / ".git" / "packed-refs"
                if packed.exists():
                    for line in packed.read_text().splitlines():
                        if line.endswith(ref[5:]):
                            return line.split()[0]
                return ""
            return ref
        except Exception:
            return ""
    return ""


def integrations() -> dict:
    from apps.payments.services import yookassa_configured

    return {"yookassa": yookassa_configured()}


def health_summary() -> dict:
    db, cache_state, channels = check_db(), check_cache(), check_channels()
    overall = "ok" if all(x["status"] == "ok" for x in (db, cache_state, channels)) else "degraded"
    return {"status": overall, "db": db, "cache": cache_state, "channels": channels}
