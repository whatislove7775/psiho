# Requires BuildKit (default in `docker compose` v2; deploy/deploy.sh enables it explicitly).
# ── Stage 1: зависимости через uv ───────────────────────────────
FROM python:3.12-slim AS builder

# uv — ставится одной командой, работает в 10-100x быстрее pip
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

WORKDIR /app

# Сначала копируем только requirements для кэширования слоя
COPY requirements.txt .

# uv создаёт venv и ставит зависимости без лишнего шума
# Кэш uv переживает пересборки (BuildKit) — повторная установка почти мгновенная
ENV UV_LINK_MODE=copy
RUN --mount=type=cache,target=/root/.cache/uv \
    uv venv /app/.venv && \
    uv pip install --python /app/.venv/bin/python -r requirements.txt

# ── Stage 2: финальный образ ────────────────────────────────────
FROM python:3.12-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Берём только venv из builder — не тащим uv и кэш в production
COPY --from=builder /app/.venv /app/.venv
COPY . .

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DJANGO_SETTINGS_MODULE=config.settings

EXPOSE 8000

# daphne — ASGI-сервер для Django Channels (WebSocket + HTTP)
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "config.asgi:application"]
