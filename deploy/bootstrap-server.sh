#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# deploy/bootstrap-server.sh — ОДНОРАЗОВАЯ настройка сервера для автодеплоя.
#
# Запускать на сервере под тем пользователем, от имени которого
# сейчас обновляется сайт (обычно root), из любой папки:
#     bash deploy/bootstrap-server.sh [DEPLOY_PATH]
#
# Что делает (безопасно запускать повторно):
#   1. создаёт отдельный SSH-ключ для GitHub Actions (если его ещё нет);
#   2. разрешает этому ключу вход на сервер (~/.ssh/authorized_keys);
#   3. печатает значения, которые нужно вставить в GitHub → Secrets.
# Ничего не перезапускает и не меняет в работе сайта.
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

DEPLOY_PATH="${1:-${DEPLOY_PATH:-$HOME/psiho}}"
KEY="$HOME/.ssh/aprosop_github_actions"
AUTH="$HOME/.ssh/authorized_keys"

ok()   { printf '\033[1;32m[OK]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m  %s\n' "$*"; }

echo
echo "=== Настройка автодеплоя aprosop.ru ==="
echo

# ── Проверки окружения ─────────────────────────────────────────
if [[ -d "$DEPLOY_PATH/.git" ]]; then
  DEPLOY_PATH="$(cd "$DEPLOY_PATH" && pwd -P)"
  ok "Проект найден: $DEPLOY_PATH"
else
  warn "Папка проекта $DEPLOY_PATH не найдена (или это не git-репозиторий)."
  warn "Укажите путь явно: bash deploy/bootstrap-server.sh /путь/к/psiho"
fi
[[ -f "$DEPLOY_PATH/.env" ]] && ok "Файл .env на месте" || warn "Нет файла $DEPLOY_PATH/.env — без него деплой не запустится."
if docker info >/dev/null 2>&1; then
  ok "Docker доступен пользователю $(whoami)"
else
  warn "Пользователь $(whoami) не может запускать docker без sudo."
  warn "Запустите этот скрипт от root или выполните: sudo usermod -aG docker $(whoami)"
fi
command -v git >/dev/null 2>&1 || warn "git не установлен"
command -v curl >/dev/null 2>&1 || warn "curl не установлен (нужен для проверок): apt-get install -y curl"

# ── 1. Ключ ────────────────────────────────────────────────────
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
if [[ -f "$KEY" ]]; then
  ok "Ключ для GitHub Actions уже есть: $KEY"
else
  ssh-keygen -t ed25519 -N "" -C "github-actions-deploy@aprosop.ru" -f "$KEY" >/dev/null
  ok "Создан новый ключ: $KEY"
fi

# ── 2. authorized_keys ─────────────────────────────────────────
touch "$AUTH"
chmod 600 "$AUTH"
PUB="$(cat "$KEY.pub")"
if grep -qF "$PUB" "$AUTH"; then
  ok "Ключ уже разрешён в $AUTH"
else
  # последняя строка файла может быть без перевода строки — иначе ключ склеится с ней
  [[ -s "$AUTH" && -n "$(tail -c1 "$AUTH")" ]] && echo >> "$AUTH"
  echo "$PUB" >> "$AUTH"
  ok "Ключ добавлен в $AUTH"
fi

# ── 3. Значения для GitHub ─────────────────────────────────────
# IPv4 обязательно: у GitHub Actions нет IPv6.
HOST="$(curl -4 -s --max-time 10 https://api.ipify.org 2>/dev/null || true)"
if ! [[ "$HOST" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  HOST="$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -m1 -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' || true)"
fi
PORT="22"
if command -v sshd >/dev/null 2>&1; then
  P="$(sshd -T 2>/dev/null | awk '/^port /{print $2; exit}' || true)"
  [[ -n "${P:-}" ]] && PORT="$P"
fi

cat <<EOF

────────────────────────────────────────────────────────────────────
 Готово! Теперь откройте GitHub:
   github.com/whatislove7775/psiho → Settings → Secrets and variables
   → Actions → кнопка «New repository secret»
 и создайте 5 секретов (имя слева, значение справа):
────────────────────────────────────────────────────────────────────

  DEPLOY_HOST     ${HOST:-<IP сервера>}
  DEPLOY_USER     $(whoami)
  DEPLOY_PORT     ${PORT}
  DEPLOY_PATH     ${DEPLOY_PATH}

  DEPLOY_SSH_KEY  ← весь текст ниже, ВКЛЮЧАЯ строки BEGIN и END:

EOF
cat "$KEY"
cat <<'EOF'

────────────────────────────────────────────────────────────────────
 ВНИМАНИЕ: этот ключ — как пароль от сервера. Вставьте его только
 в GitHub Secrets и больше никуда не пересылайте.
 После этого терминал больше не нужен — сайт будет обновляться сам.
────────────────────────────────────────────────────────────────────
EOF
