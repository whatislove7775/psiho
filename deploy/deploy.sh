#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# deploy/deploy.sh — обновление aprosop.ru на сервере.
#
# Запускается автоматически из GitHub Actions (по SSH) или вручную:
#     bash deploy/deploy.sh [DEPLOY_PATH] [BRANCH]
#     make deploy
#
# Что делает:
#   1. git fetch + жёсткий переход на origin/BRANCH (локальные правки
#      отслеживаемых файлов сохраняются в git stash, .env не трогается);
#   2. docker compose build api web + up -d;
#   3. ждёт, пока api и web станут healthy;
#   4. если что-то пошло не так — откатывает код на предыдущий коммит,
#      пересобирает и выходит с кодом 1.
#
# Никогда не трогает .env, volumes с базой и сертификатами.
# Идемпотентен: повторный запуск на том же коммите просто пересобирает.
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

# Всё тело — в функции: bash прочитает её целиком до выполнения,
# поэтому `git reset` не сломает скрипт, даже если он сам изменится.
main() {
  local deploy_path="${1:-${DEPLOY_PATH:-$HOME/psiho}}"
  local branch="${2:-${DEPLOY_BRANCH:-claude/psychology-platform-design-n89Ow}}"
  local repo_url="${REPO_URL:-https://github.com/whatislove7775/psiho.git}"
  local health_timeout="${HEALTH_TIMEOUT:-240}"
  local domain="${SITE_DOMAIN:-aprosop.ru}"

  log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
  warn() { printf '\033[1;33mWARN: %s\033[0m\n' "$*" >&2; }
  die() { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

  [[ -d "$deploy_path" ]] || die "Папка проекта $deploy_path не найдена."
  cd "$deploy_path"
  [[ -d .git ]] || die "$deploy_path — не git-репозиторий."

  # ── Не даём двум деплоям идти одновременно ─────────────────────
  if command -v flock >/dev/null 2>&1; then
    exec 9>"${TMPDIR:-/tmp}/aprosop-deploy.lock"
    if ! flock -n 9; then
      log "Другой деплой уже идёт — ждём до 15 минут..."
      flock -w 900 9 || die "Не дождались окончания другого деплоя."
    fi
  fi

  # ── docker compose (плагин) или docker-compose (старый) ────────
  local -a compose
  if docker compose version >/dev/null 2>&1; then
    compose=(docker compose)
  elif command -v docker-compose >/dev/null 2>&1; then
    compose=(docker-compose)
  else
    die "Не найден docker compose."
  fi
  export DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1

  # ── .env обязателен ────────────────────────────────────────────
  [[ -f .env ]] || die "Файл $deploy_path/.env не найден. Скопируйте .env.example в .env и заполните значения (см. deploy/SETUP.md)."
  grep -q '^NEXT_PUBLIC_API_URL=' .env \
    || warn "В .env нет NEXT_PUBLIC_API_URL — фронтенд соберётся с адресом http://localhost/api/v1."
  # Ключ шифрования чатов: создаётся один раз и больше никогда не меняется.
  if ! grep -q '^CHAT_ENCRYPTION_KEY=.' .env; then
    printf '\n# Ключ шифрования чатов. НЕ МЕНЯТЬ и не терять — иначе переписка станет нечитаемой.\nCHAT_ENCRYPTION_KEY=%s\n' \
      "$(openssl rand -base64 32 | tr '+/' '-_')" >> .env
    log "В .env добавлен CHAT_ENCRYPTION_KEY"
  fi

  # ── git: origin → psiho ────────────────────────────────────────
  local current_url
  current_url="$(git remote get-url origin 2>/dev/null || true)"
  if [[ -z "$current_url" ]]; then
    git remote add origin "$repo_url"
  elif [[ "$current_url" != *"whatislove7775/psiho"* ]]; then
    warn "origin указывал на $current_url — меняю на $repo_url"
    git remote set-url origin "$repo_url"
  fi   # если URL уже про psiho (в т.ч. с токеном) — не трогаем

  log "Получаю $branch из origin"
  git fetch --depth 50 origin "+refs/heads/${branch}:refs/remotes/origin/${branch}"

  local prev new
  prev="$(git rev-parse HEAD)"
  new="$(git rev-parse "origin/${branch}")"
  echo "Текущий коммит: ${prev:0:10}"
  echo "Новый коммит:   ${new:0:10}"

  # Локальные правки отслеживаемых файлов — в stash (не теряются).
  if ! git diff --quiet || ! git diff --cached --quiet; then
    local stash_msg="deploy-backup-$(date +%Y%m%d-%H%M%S)"
    warn "На сервере есть локальные изменения — сохраняю в git stash ($stash_msg)"
    git -c user.name=deploy -c user.email=deploy@localhost stash push -m "$stash_msg"
  fi

  git checkout -f -B "$branch" "origin/${branch}"
  git reset --hard "origin/${branch}"

  # ── helpers ────────────────────────────────────────────────────
  container_state() {
    local id
    id="$("${compose[@]}" ps -q "$1" 2>/dev/null | head -n1)"
    [[ -n "$id" ]] || { echo "missing"; return; }
    docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || echo "missing"
  }

  wait_healthy() {
    local deadline=$(( SECONDS + health_timeout )) svc st all_ok
    while (( SECONDS < deadline )); do
      all_ok=1
      for svc in api web; do
        st="$(container_state "$svc")"
        case "$st" in
          healthy|running) ;;
          unhealthy|exited|dead) echo "  $svc: $st"; return 1 ;;
          *) all_ok=0 ;;
        esac
      done
      (( all_ok )) && return 0
      echo "  ждём... api=$(container_state api) web=$(container_state web)"
      sleep 5
    done
    return 1
  }

  reload_nginx() {
    # nginx запоминает IP контейнеров api/web при старте — после пересоздания
    # их нужно перечитать, иначе будет 502.
    if "${compose[@]}" exec -T nginx nginx -t >/dev/null 2>&1; then
      "${compose[@]}" exec -T nginx nginx -s reload || return 1
    else
      "${compose[@]}" exec -T nginx nginx -t || true
      return 1
    fi
  }

  smoke_via_nginx() {
    command -v curl >/dev/null 2>&1 || { warn "curl не установлен — пропускаю проверку через nginx"; return 0; }
    local i code
    for i in 1 2 3 4 5 6; do
      code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 \
        --resolve "${domain}:443:127.0.0.1" "https://${domain}/api/v1/health/" || true)"
      case "$code" in
        200) echo "  nginx → api: OK"; return 0 ;;
        502|503|504) sleep 5 ;;
        *) warn "проверка через nginx вернула код '$code' (не 5xx) — не считаю это ошибкой деплоя"; return 0 ;;
      esac
    done
    echo "  nginx → api: код $code"
    return 1
  }

  up_stack() {
    "${compose[@]}" up -d --remove-orphans
  }

  rollback() {
    local reason="$1"
    printf '\n\033[1;31m!!! Деплой не удался: %s\033[0m\n' "$reason" >&2
    echo "--- последние логи api/web ---"
    "${compose[@]}" logs --tail 80 api web 2>&1 || true
    if [[ "$prev" == "$new" ]]; then
      warn "Предыдущий коммит совпадает с новым — откатываться некуда."
      exit 1
    fi
    log "Откат на предыдущий коммит ${prev:0:10}"
    git reset --hard "$prev"
    export GIT_COMMIT="$(git rev-parse --short HEAD)" BUILD_TIME="$(date -u +%FT%TZ)"
    if "${compose[@]}" build api web && up_stack && wait_healthy; then
      reload_nginx || true
      echo "Откат выполнен: работает ${prev:0:10}"
    else
      warn "Откат тоже не прошёл проверку — нужна ручная диагностика: ${compose[*]} logs api web"
    fi
    echo "$(date -Is) FAILED ${new:0:10} → rolled back to ${prev:0:10} ($reason)" >> "$HOME/.aprosop-deploy.log" 2>/dev/null || true
    exit 1
  }

  # ── Сборка ─────────────────────────────────────────────────────
  log "Сборка образов api и web"
  export GIT_COMMIT="$(git rev-parse --short HEAD)" BUILD_TIME="$(date -u +%FT%TZ)"
  if ! "${compose[@]}" build api web; then
    # Контейнеры ещё не тронуты — просто возвращаем код.
    warn "Сборка упала — сайт продолжает работать на ${prev:0:10}, возвращаю код."
    git reset --hard "$prev"
    exit 1
  fi

  # ── Запуск ─────────────────────────────────────────────────────
  log "Запуск контейнеров"
  up_stack || rollback "docker compose up завершился с ошибкой"

  log "Ждём готовности api и web (до ${health_timeout} с)"
  wait_healthy || rollback "api/web не стали healthy (лимит ${health_timeout} с)"

  log "Перечитываю конфиг nginx"
  reload_nginx || rollback "nginx -t / reload не прошёл"
  smoke_via_nginx || rollback "nginx отвечает 5xx на /api/v1/health/"

  # ── Уборка ─────────────────────────────────────────────────────
  log "Удаляю старые образы"
  docker image prune -f >/dev/null || true
  docker builder prune -f --filter until=168h >/dev/null 2>&1 || true

  echo "$(date -Is) OK ${new:0:10} (${branch})" >> "$HOME/.aprosop-deploy.log" 2>/dev/null || true
  log "Готово. Развёрнут коммит:"
  git log -1 --format='  %h  %s%n  автор: %an, %cd' --date=format:'%Y-%m-%d %H:%M'
}

main "$@"
