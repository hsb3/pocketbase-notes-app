# Local dev/testing. Reads .env (PB_PORT, PB_EMAIL, PB_PASSWORD, ...).
-include .env
export

PB_PORT ?= 8080

# Compose runs from the repo root so .env and ./pb volume paths resolve here.
COMPOSE      = docker compose --project-directory . -f deploy/local/docker-compose.yml
COMPOSE_FULL = docker compose --project-directory . -f deploy/local/docker-compose-full.yml

.DEFAULT_GOAL := help

.PHONY: help start up up-full dev-cert down down-full logs health seed dev dev-solo install codegen lint build clean

help: ## show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(firstword $(MAKEFILE_LIST)) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

start: up seed dev ## backend + seed + frontend

up: ## start PocketBase (docker)
	$(COMPOSE) up --build -d

up-full: dev-cert ## start PocketBase + Mailpit + MinIO
	$(COMPOSE_FULL) up --build -d

dev-cert: ## generate scripts/cert.pem + key.pem if missing (needed by up-full)
	@[ -r scripts/cert.pem ] && [ -r scripts/key.pem ] || \
		openssl req -x509 -newkey rsa:4096 -nodes -keyout scripts/key.pem -out scripts/cert.pem \
			-sha256 -days 3650 -subj "/CN=." -addext "subjectAltName = DNS:mailpit"

down: ## stop PocketBase
	$(COMPOSE) down

down-full: ## stop the full stack
	$(COMPOSE_FULL) down

logs: ## tail PocketBase logs
	$(COMPOSE) logs -f pocketbase

health: ## check the PocketBase API
	curl -s http://localhost:$(PB_PORT)/api/health && echo

seed: ## seed admin + regular user (verified) and check both logins
	./scripts/seed.sh

dev: ## vite dev server (foreground)
	bun dev

dev-solo: ## frontend only, no backend, auth bypassed
	VITE_AUTH_BYPASS=true bun dev

install:
	bun install

codegen: ## regenerate PocketBase record types
	bun run pb:codegen

lint:
	bun run lint

build:
	bun run build

clean: ## remove build output and installed deps (keeps pb/data)
	rm -rf dist .tanstack node_modules
