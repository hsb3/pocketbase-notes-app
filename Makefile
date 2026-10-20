# Local dev/testing. Reads .env (PB_PORT, PB_EMAIL, PB_PASSWORD, ...).
-include .env
export

PB_PORT ?= 8080

# Compose runs from the repo root so .env and ./pb volume paths resolve here.
COMPOSE      = docker compose --project-directory . -f deploy/local/docker-compose.yml
COMPOSE_FULL = docker compose --project-directory . -f deploy/local/docker-compose-full.yml

# Self-contained stacks: override per stack, e.g. make stack-up STACK=demo STACK_PORT=8200
STACK                     ?= pocketbase-notes
STACK_PORT                ?= 8100
STACK_MAILPIT_PORT        ?= 8125
STACK_RUSTFS_CONSOLE_PORT ?= 9101
STACK_FILE                 = deploy/local/docker-compose-stack.yml
COMPOSE_STACK              = docker compose --project-directory . -p $(STACK) -f $(STACK_FILE)

.DEFAULT_GOAL := help

.PHONY: help start start-full check-services smoke e2e up up-full dev-cert down down-full logs health seed dev dev-solo install codegen lint build clean \
	stack-build stack-up stack-seed stack-check stack-down stack-logs

##@ General

help: ## show available commands
	@grep -E '^([a-zA-Z_-]+:.*?## |##@ )' $(firstword $(MAKEFILE_LIST)) | \
		awk 'BEGIN {FS = ":.*?## "} /^##@/ {printf "\n\033[1m%s\033[0m\n", substr($$0, 5); next} {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

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

##@ Self-contained stack (no checkout mounts; STACK=<name>)

# Point the shared setup/seed/check scripts at this stack instead of the dev stack.
stack-up stack-seed stack-check: export VITE_PB_URL  = http://127.0.0.1:$(STACK_PORT)
stack-up stack-seed stack-check: export PB_URL       = http://127.0.0.1:$(STACK_PORT)
stack-up stack-seed stack-check: export DEV_APP_URL  = http://127.0.0.1:$(STACK_PORT)
stack-up stack-seed stack-check: export MAILPIT_URL  = http://127.0.0.1:$(STACK_MAILPIT_PORT)
stack-up stack-seed stack-check: export PB_CONTAINER = $(STACK)-pocketbase-1
stack-up stack-seed stack-check: export COMPOSE_FILE = $(STACK_FILE)
stack-up stack-seed stack-check: export COMPOSE_PROJECT_NAME = $(STACK)

stack-build: ## build image with frontend, hooks and migrations baked in
	$(COMPOSE_STACK) build

stack-up: stack-build ## start + configure stack STACK (app and API on STACK_PORT)
	$(COMPOSE_STACK) up -d --wait --wait-timeout 90
	$(COMPOSE_STACK) run --rm storage-init
	bun run scripts/configure-services.ts
	@echo "$(STACK): app http://127.0.0.1:$(STACK_PORT)  Mailpit http://127.0.0.1:$(STACK_MAILPIT_PORT)  RustFS http://127.0.0.1:$(STACK_RUSTFS_CONSOLE_PORT)"

stack-seed: ## seed accounts and sample entries into stack STACK
	./scripts/seed.sh

stack-check: ## verify email and RustFS uploads against stack STACK
	bun run scripts/test-services.ts

stack-down: ## stop stack STACK (keeps its volumes)
	$(COMPOSE_STACK) down

stack-logs: ## tail PocketBase logs for stack STACK
	$(COMPOSE_STACK) logs -f pocketbase

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

##@ Testing

smoke: ## fast live service + browser smoke checks (backend must be running)
	bun run test:smoke

e2e: ## API + desktop/mobile browser suite (backend must be running)
	bun run test:e2e
