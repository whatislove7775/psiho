#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# deploy/provision.sh — установка aprosop.ru на ЧИСТЫЙ сервер Ubuntu.
#
# Одна команда в веб-консоли Beget (под root):
#   curl -fsSL https://raw.githubusercontent.com/whatislove7775/psiho/claude/psychology-platform-design-n89Ow/deploy/provision.sh | bash
#
# Что делает (безопасно запускать повторно):
#   1. ставит Docker, git, swap 2 ГБ;
#   2. скачивает проект в /root/psiho;
#   3. создаёт .env со случайными паролями (если его ещё нет);
#   4. выпускает HTTPS-сертификат Let's Encrypt — как только домен
#      aprosop.ru указывает на этот сервер (до этого — временный,
#      а таймер сам повторяет попытку каждые 5 минут);
#   5. собирает и запускает сайт;
#   6. печатает значения для GitHub → Secrets (автодеплой).
#
#   provision.sh --cert   только шаг 4 (его вызывает таймер).
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

REPO="https://github.com/whatislove7775/psiho.git"
BRANCH="claude/psychology-platform-design-n89Ow"
DIR="/root/psiho"
DOMAIN="aprosop.ru"

ok()   { printf '\033[1;32m[OK]\033[0m %s\n' "$*"; }
info() { printf '\033[1;34m[..]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m  %s\n' "$*"; }

[[ $EUID -eq 0 ]] || { echo "Запустите под root"; exit 1; }

public_ip() { curl -4 -fsS --max-time 8 https://api.ipify.org || curl -4 -fsS --max-time 8 https://ifconfig.me; }
resolves_here() { [[ "$(getent ahostsv4 "$1" | awk 'NR==1{print $1}')" == "$(public_ip)" ]]; }

certs_dir() {
  docker compose -f "$DIR/docker-compose.yml" create certbot >/dev/null 2>&1 || true
  docker volume inspect -f '{{.Mountpoint}}' "$(basename "$DIR")_certbot-conf"
}

# Временный самоподписанный сертификат, чтобы nginx и coturn могли стартовать.
dummy_cert() {
  local d; d="$(certs_dir)"
  [[ -f "$d/live/$DOMAIN/fullchain.pem" ]] && return 0
  mkdir -p "$d/live/$DOMAIN"
  openssl req -x509 -nodes -newkey rsa:2048 -days 30 -subj "/CN=$DOMAIN" \
    -keyout "$d/live/$DOMAIN/privkey.pem" -out "$d/live/$DOMAIN/fullchain.pem" >/dev/null 2>&1
  touch "$d/live/$DOMAIN/.dummy"
  ok "Временный сертификат создан"
}

real_cert() {
  cd "$DIR"
  exec 9>/run/aprosop-cert.lock
  flock -n 9 || { info "Сертификат уже выпускается другим процессом"; return 1; }
  local d; d="$(certs_dir)"
  if [[ -L "$d/live/$DOMAIN/fullchain.pem" && ! -f "$d/live/$DOMAIN/.dummy" ]]; then
    ok "HTTPS-сертификат уже есть"; systemctl disable --now aprosop-cert.timer >/dev/null 2>&1 || true; return 0
  fi
  if ! resolves_here "$DOMAIN"; then
    warn "$DOMAIN пока указывает не на этот сервер ($(public_ip)) — сертификат выпущу позже автоматически"
    return 1
  fi
  local names=(-d "$DOMAIN"); resolves_here "www.$DOMAIN" && names+=(-d "www.$DOMAIN")
  local try
  for try in 1 2 3; do
    rm -rf "$d/live/$DOMAIN" "$d/archive/$DOMAIN" "$d/renewal/$DOMAIN.conf"
    if docker compose run -T --rm --entrypoint certbot certbot certonly --webroot -w /var/www/certbot \
         "${names[@]}" --agree-tos --register-unsafely-without-email --non-interactive --cert-name "$DOMAIN" </dev/null; then
      docker compose exec -T nginx nginx -s reload </dev/null || docker compose restart nginx </dev/null
      docker compose restart coturn </dev/null
      systemctl disable --now aprosop-cert.timer >/dev/null 2>&1 || true
      ok "HTTPS-сертификат Let's Encrypt выпущен"
      return 0
    fi
    sleep 20
  done
  dummy_cert; docker compose restart nginx </dev/null >/dev/null 2>&1 || true
  warn "Let's Encrypt не выдал сертификат — повторю через 5 минут"
  return 1
}

cert_timer() {
  cat >/etc/systemd/system/aprosop-cert.service <<EOF
[Unit]
Description=aprosop.ru: issue Let's Encrypt certificate
[Service]
Type=oneshot
ExecStart=/bin/bash $DIR/deploy/provision.sh --cert
EOF
  cat >/etc/systemd/system/aprosop-cert.timer <<'EOF'
[Unit]
Description=aprosop.ru: retry certificate every 5 minutes
[Timer]
OnActiveSec=5min
OnUnitActiveSec=5min
[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable --now aprosop-cert.timer >/dev/null
  ok "Таймер выпуска сертификата включён"
}

# Весь скрипт — одна группа: bash дочитывает её целиком до запуска,
# поэтому команды не "съедают" остаток скрипта при запуске через curl | bash.
{
if [[ "${1:-}" == "--cert" ]]; then real_cert || true; exit 0; fi

echo; echo "=== Установка aprosop.ru на новый сервер ==="; echo

# ── 1. Пакеты, Docker, swap ────────────────────────────────────
export DEBIAN_FRONTEND=noninteractive
info "Ставлю системные пакеты"
apt-get update -qq && apt-get install -y -qq git curl openssl ca-certificates >/dev/null
if ! command -v docker >/dev/null; then
  info "Ставлю Docker (2–3 минуты)"
  curl -fsSL https://get.docker.com | sh >/dev/null
fi
systemctl enable --now docker >/dev/null
ok "Docker $(docker --version | awk '{print $3}' | tr -d ,)"
if ! grep -q /swapfile <<<"$(swapon --show)"; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q /swapfile /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ok "Swap 2 ГБ включён"
fi
if command -v ufw >/dev/null && grep -q 'Status: active' <<<"$(ufw status)"; then
  ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
  ufw allow 3478 >/dev/null; ufw allow 5349 >/dev/null; ufw allow 49152:65535/udp >/dev/null
  ok "Порты открыты в ufw"
fi

# ── 2. Код ─────────────────────────────────────────────────────
if [[ -d "$DIR/.git" ]]; then
  git -C "$DIR" fetch -q origin "$BRANCH" && git -C "$DIR" checkout -q -B "$BRANCH" FETCH_HEAD
else
  git clone -q --branch "$BRANCH" "$REPO" "$DIR"
fi
ok "Код в $DIR ($(git -C "$DIR" rev-parse --short HEAD))"
cd "$DIR"

# ── 3. .env ────────────────────────────────────────────────────
NEW_ADMIN_PASSWORD=""
if [[ ! -f .env ]]; then
  rnd() { local s; s="$(openssl rand -hex 48)"; echo "${s:0:$1}"; }
  NEW_ADMIN_PASSWORD="$(rnd 20)"
  TURN_PW="$(rnd 24)"
  cat > .env <<EOF
SECRET_KEY=$(rnd 64)
DEBUG=False
ALLOWED_HOSTS=$DOMAIN,www.$DOMAIN,localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=https://$DOMAIN,https://www.$DOMAIN
EMAIL_HASH_SALT=ANON_PSY_EMAIL_SALT_v1
ADMIN_LOGIN=admin
ADMIN_PASSWORD=$NEW_ADMIN_PASSWORD
DB_NAME=anonpsy
DB_USER=postgres
DB_PASSWORD=$(rnd 32)
PLATFORM_FEE_PERCENT=20.0
YOOKASSA_RETURN_URL=https://$DOMAIN/session/payment-complete
TURN_USER=aprosop
TURN_PASSWORD=$TURN_PW
NEXT_PUBLIC_API_URL=https://$DOMAIN/api/v1
NEXT_PUBLIC_WS_URL=wss://$DOMAIN
EOF
  chmod 600 .env
  ok ".env создан со случайными паролями"
else
  ok ".env уже есть — не трогаю"
fi

# ── 4. Сертификат (временный, настоящий — когда домен смотрит сюда) ──
dummy_cert

# ── 5. Сборка и запуск ─────────────────────────────────────────
info "Собираю и запускаю сайт (5–15 минут при первом запуске)"
docker compose up -d --build </dev/null
ok "Контейнеры запущены"

cert_timer
real_cert || true

# ── 6. Автодеплой ──────────────────────────────────────────────
bash deploy/bootstrap-server.sh "$DIR" </dev/null || true

echo
echo "=== Готово ==="
echo "  IP сервера: $(public_ip)"
ADMIN_PW="$(grep -m1 '^ADMIN_PASSWORD=' .env | cut -d= -f2-)"
ADMIN_LG="$(grep -m1 '^ADMIN_LOGIN=' .env | cut -d= -f2-)"
echo "  Админка:    https://$DOMAIN/admin   логин: ${ADMIN_LG:-admin}   пароль: $ADMIN_PW"
echo "  (пароль хранится в $DIR/.env)"
echo
exit 0
}
