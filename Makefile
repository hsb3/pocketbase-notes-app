# Local dev/testing. Reads .env (PB_PORT, PB_EMAIL, PB_PASSWORD, ...).
-include .env
export

PB_PORT ?= 8080

# Compose runs from the repo root so .env and ./pb volume paths resolve here.
COMPOSE      = docker compose --project-directory . -f deploy/local/docker-compose.yml
COMPOSE_FULL = docker compose --project-directory . -f deploy/local/docker-compose-full.yml

.DEFAULT_GOAL := help

.PHONY: help start start-full check-services up up-full dev-cert down down-full logs health seed dev dev-solo install codegen lint build clean

##@ General

help: ## show available commands
	@grep -E '^([a-zA-Z_-]+:.*?## |##@ )' $(firstword $(MAKEFILE_LIST)) | \
		awk 'BEGIN {FS = ":.*?## "} /^##@/ {printf "\n\033[1m%s\033[0m\n", substr($$0, 5); next} {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

start: up seed dev ## backend + seed + frontend

start-full: up-full ## Mailpit + RustFS + configured backend + frontend
	$(MAKE) seed
	$(MAKE) dev

##@ Backend (PocketBase)

up: ## start PocketBase (docker)
	$(COMPOSE) up --build -d

down: ## stop PocketBase
	$(COMPOSE) down

logs: ## tail PocketBase logs
	$(COMPOSE) logs -f pocketbase

health: ## check the PocketBase API
	curl -s http://localhost:$(PB_PORT)/api/health && echo

seed: ## seed admin + regular user (verified) and check both logins
	./scripts/seed.sh

codegen: ## regenerate PocketBase record types
	bun run pb:codegen

##@ Full stack (Mailpit + RustFS)

up-full: dev-cert ## start and configure PocketBase + Mailpit + RustFS
	$(COMPOSE_FULL) up --build -d --wait --wait-timeout 90
	$(COMPOSE_FULL) run --rm storage-init
	bun run scripts/configure-services.ts

check-services: ## verify email delivery and RustFS uploads against the local stack
	bun run scripts/test-services.ts

down-full: ## stop the full stack
	$(COMPOSE_FULL) down

dev-cert: ## generate scripts/cert.pem + key.pem if missing (needed by up-full)
	@[ -r scripts/cert.pem ] && [ -r scripts/key.pem ] || \
		openssl req -x509 -newkey rsa:4096 -nodes -keyout scripts/key.pem -out scripts/cert.pem \
			-sha256 -days 3650 -subj "/CN=." -addext "subjectAltName = DNS:mailpit"

##@ Frontend

install: ## install dependencies
	bun install

dev: ## vite dev server (foreground)
	bun dev

dev-solo: ## frontend only, no backend, auth bypassed
	VITE_AUTH_BYPASS=true bun dev

lint: ## lint with Biome
	bun run lint

build: ## type-check + production build
	bun run build

clean: ## remove build output and installed deps (keeps pb/data)
	rm -rf dist .tanstack node_modules
