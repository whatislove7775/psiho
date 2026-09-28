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

# ── Stage 2b: speech-recognition model for on-device captions ─────
# Vosk small Russian model (Apache-2.0, ~45 MB) served from our origin at /stt/;
# browsers download it once and cache it (lib/captions/engine.ts). Cached as a
# layer, so it is fetched only when STT_MODEL changes. If the download fails the
# build still succeeds: without /stt/manifest.json captions simply stay hidden.
FROM alpine:3.20 AS stt
ARG STT_MODEL=vosk-model-small-ru-0.22
RUN mkdir -p /stt && cd /tmp && \
    if wget -q "https://alphacephei.com/vosk/models/${STT_MODEL}.zip" -O m.zip && unzip -q m.zip; then \
      tar czf "/stt/${STT_MODEL}.tar.gz" "${STT_MODEL}" && \
      printf '{"lang":"ru","model":"/stt/%s.tar.gz","bytes":%s,"version":"%s"}\n' \
        "${STT_MODEL}" "$(stat -c %s "/stt/${STT_MODEL}.tar.gz")" "${STT_MODEL}" > /stt/manifest.json; \
    else echo "WARN: STT model not downloaded, live captions will be hidden"; fi; \
    rm -rf /tmp/*

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
COPY --from=stt /stt ./public/stt
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]
