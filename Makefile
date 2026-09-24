.PHONY: up down build logs logs-api logs-web shell-api migrate deploy dev-api dev-web help

# Определяем docker compose команду (новый плагин или старый через дефис)
DOCKER_COMPOSE := $(shell docker compose version > /dev/null 2>&1 && echo "docker compose" || echo "docker-compose")

# ── Production ────────────────────────────────────────────────────
up:         ## Запустить всё (собрать если нужно)
	$(DOCKER_COMPOSE) up -d --build

down:       ## Остановить всё
	$(DOCKER_COMPOSE) down

build:      ## Пересобрать образы без кэша
	$(DOCKER_COMPOSE) build --no-cache

logs:       ## Смотреть логи всех сервисов
	$(DOCKER_COMPOSE) logs -f

logs-api:   ## Логи только Django
	$(DOCKER_COMPOSE) logs -f api

logs-web:   ## Логи только Next.js
	$(DOCKER_COMPOSE) logs -f web

deploy:     ## Обновить сайт: git pull + сборка + проверка + автооткат (deploy/deploy.sh)
	bash deploy/deploy.sh "$(CURDIR)" $(BRANCH)

migrate:    ## Применить миграции Django
	$(DOCKER_COMPOSE) exec api /app/.venv/bin/python manage.py migrate

shell-api:  ## Bash внутри Django контейнера
	$(DOCKER_COMPOSE) exec api bash

# ── Local dev (без Docker) ────────────────────────────────────────
dev-api:    ## Django локально через uv
	cd apps/api && \
	uv venv .venv && \
	uv pip install -r requirements.txt && \
	.venv/bin/python manage.py migrate && \
	.venv/bin/python manage.py runserver 8000

dev-web:    ## Next.js локально
	cd apps/web && npm install && npm run dev

help:       ## Список команд
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
