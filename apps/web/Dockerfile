# Requires BuildKit (default in `docker compose` v2; deploy/deploy.sh enables it explicitly).

# ── Stage 1: зависимости (кэшируется, пока не меняется package*.json) ──
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json* ./
# npm ci по lock-файлу (быстро и воспроизводимо); если lock рассинхронизирован
# с package.json — откатываемся на npm install, чтобы сборка не падала.
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then \
      npm ci --legacy-peer-deps --no-audit --no-fund \
      || npm install --legacy-peer-deps --no-audit --no-fund; \
    else \
      npm install --legacy-peer-deps --no-audit --no-fund; \
    fi

# ── Stage 2: сборка Next.js ─────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* vars must be baked in at build time
ARG NEXT_PUBLIC_API_URL=http://localhost/api/v1
ARG NEXT_PUBLIC_WS_URL=ws://localhost
ARG NEXT_PUBLIC_TURN_USER=aprosop
ARG NEXT_PUBLIC_TURN_PASSWORD=aprosopsecretturn
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL \
    NEXT_PUBLIC_TURN_USER=$NEXT_PUBLIC_TURN_USER \
    NEXT_PUBLIC_TURN_PASSWORD=$NEXT_PUBLIC_TURN_PASSWORD \
    NEXT_TELEMETRY_DISABLED=1

# Serve MediaPipe's WASM from our own origin (copied from node_modules)
RUN node scripts/copy-mediapipe.mjs

RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

# ── Stage 3: production runner ───────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# HOSTNAME=0.0.0.0 — standalone server слушает все интерфейсы
# (иначе Docker подставляет id контейнера и healthcheck на 127.0.0.1 не проходит).
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

# Берём только то что нужно для запуска
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]
