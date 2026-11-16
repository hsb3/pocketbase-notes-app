# Local development, self-contained stacks and Railway operator commands.
# Run `make help` for a guided list. Reads .env (PB_PORT, PB_EMAIL, PB_PASSWORD, ...).

# Targets that start a backend first make sure .env exists and has its secrets.
# This runs before .env is read below; existing values are never changed.
ENV_GOALS := env app start start-full up up-full stack-up
ifneq ($(filter $(ENV_GOALS),$(MAKECMDGOALS)),)
  $(shell ./scripts/init-env.sh 1>&2)
endif

-include .env
export

PB_PORT ?= 8080

# Compose runs from the repo root so .env and ./pb volume paths resolve here.
COMPOSE      = docker compose --project-directory . -f deploy/local/docker-compose.yml
COMPOSE_FULL = docker compose --project-directory . -f deploy/local/docker-compose-full.yml

# Self-contained stacks: override per stack, e.g. make app STACK=demo STACK_PORT=8200
STACK                     ?= pocketbase-notes
STACK_PORT                ?= 8100
STACK_MAILPIT_PORT        ?= 8125
STACK_RUSTFS_CONSOLE_PORT ?= 9101
STACK_FILE                 = deploy/local/docker-compose-stack.yml
COMPOSE_STACK              = docker compose --project-directory . -p $(STACK) -f $(STACK_FILE)
STACK_SETUP                = $(COMPOSE_STACK) run --rm --quiet-pull setup bun run

# Railway operator scripts read their target from this private file.
RAILWAY_ENV ?= deploy/railway/.env
RAILWAY_RUN  = RAILWAY_ENV=$(RAILWAY_ENV) ./deploy/railway/run.sh

.DEFAULT_GOAL := help

.PHONY: help env app start start-full check-services smoke e2e up up-full dev-cert down down-full logs health seed dev dev-solo install codegen lint build clean \
	stack-build stack-up stack-seed stack-check stack-down stack-destroy stack-logs \
	railway-check-backups railway-verify-restore railway-configure railway-backup \
	railway-verify-app railway-verify-signup railway-verify-email

##@ General

help: ## show this list
	@printf '\n\033[1mWhich one do I want?\033[0m\n'
	@printf '  \033[36m%-24s\033[0m %s\n' \
		'make app' 'Just run it: the whole app in Docker, seeded. Needs only Docker.' \
		'make start' 'Work on the code: PocketBase in Docker + Vite hot reload. Needs Bun.' \
		'make start-full' 'Same, plus local email (Mailpit) and S3 storage (RustFS).'
	@printf '  Each one creates .env with generated secrets if it is missing.\n'
	@printf '  More: docs/development/setup.md, deploy/README.md\n'
	@awk 'BEGIN {FS = ":.*?## "} \
		/^##@/ {printf "\n\033[1m%s\033[0m\n", substr($$0, 5); next} \
		/^[a-zA-Z0-9_-]+:.*## / {printf "  \033[36m%-24s\033[0m %s\n", $$1, $$2}' $(firstword $(MAKEFILE_LIST))
	@printf '\n'

env: ## create .env if missing and generate empty secrets (never overwrites)
	@echo ".env is ready."

app: stack-up ## build, start and seed the self-contained app; prints URL and login
	$(STACK_SETUP) scripts/seed.ts $(SEED_ARGS)
	@printf '\n\033[1m%s is running\033[0m\n' '$(STACK)'
	@printf '  %-10s %s\n' \
		'App' 'http://127.0.0.1:$(STACK_PORT)' \
		'Login' '$(or $(SEED_USER_EMAIL),user@example.com) / $(or $(SEED_USER_PASSWORD),user-changeme-123)' \
		'Admin' 'http://127.0.0.1:$(STACK_PORT)/_/  ($(PB_EMAIL), password: PB_PASSWORD in .env)' \
		'Email' 'http://127.0.0.1:$(STACK_MAILPIT_PORT)  (Mailpit inbox; nothing leaves this machine)' \
		'Files' 'http://127.0.0.1:$(STACK_RUSTFS_CONSOLE_PORT)  (RustFS console)' \
		'Stop' 'make stack-down$(if $(filter-out pocketbase-notes,$(STACK)), STACK=$(STACK))  (data is kept)'
	@printf '  The login is for local use only: it is the default seed account.\n\n'

start: up seed dev ## backend + seed + Vite dev server

start-full: up-full ## Mailpit + RustFS + configured backend + seed + Vite
	$(MAKE) seed
	$(MAKE) dev

##@ Backend for development (PocketBase, checkout mounted)

up: ## start PocketBase (docker)
	$(COMPOSE) up --build -d

down: ## stop PocketBase
	$(COMPOSE) down

logs: ## tail PocketBase logs
	$(COMPOSE) logs -f pocketbase

health: ## check the PocketBase API
	curl -s http://localhost:$(PB_PORT)/api/health && echo

seed: ## create missing local accounts; preserve existing passwords
	./scripts/seed.sh $(SEED_ARGS)

codegen: ## regenerate PocketBase record types
	bun run pb:codegen

##@ Full development stack (adds Mailpit + RustFS)

up-full: dev-cert ## start and configure PocketBase + Mailpit + RustFS
	$(COMPOSE_FULL) up --build -d --wait --wait-timeout 90
	$(COMPOSE_FULL) run --rm storage-init
	bun run scripts/configure-services.ts

check-services: ## verify email delivery and RustFS uploads against the full stack
	bun run scripts/test-services.ts

down-full: ## stop the full stack
	$(COMPOSE_FULL) down

dev-cert: ## generate scripts/cert.pem + key.pem if missing (needed by up-full)
	@[ -r scripts/cert.pem ] && [ -r scripts/key.pem ] || \
		openssl req -x509 -newkey rsa:4096 -nodes -keyout scripts/key.pem -out scripts/cert.pem \
			-sha256 -days 3650 -subj "/CN=." -addext "subjectAltName = DNS:mailpit"

##@ Self-contained stack (what `make app` runs; nothing mounted; STACK=<name>)

# stack-check runs on the host: point the shared check script at this stack.
stack-check: export VITE_PB_URL  = http://127.0.0.1:$(STACK_PORT)
stack-check: export PB_URL       = http://127.0.0.1:$(STACK_PORT)
stack-check: export DEV_APP_URL  = http://127.0.0.1:$(STACK_PORT)
stack-check: export MAILPIT_URL  = http://127.0.0.1:$(STACK_MAILPIT_PORT)
stack-check: export PB_CONTAINER = $(STACK)-pocketbase-1
stack-check: export COMPOSE_FILE = $(STACK_FILE)
stack-check: export COMPOSE_PROJECT_NAME = $(STACK)

stack-build: ## build the app image and the setup image
	$(COMPOSE_STACK) --profile setup build

stack-up: stack-build ## start + configure stack STACK without seeding (app and API on STACK_PORT)
	$(COMPOSE_STACK) up -d --wait --wait-timeout 90
	$(COMPOSE_STACK) run --rm --quiet-pull storage-init
	$(STACK_SETUP) scripts/configure-services.ts
	@echo "$(STACK): app http://127.0.0.1:$(STACK_PORT)  Mailpit http://127.0.0.1:$(STACK_MAILPIT_PORT)  RustFS http://127.0.0.1:$(STACK_RUSTFS_CONSOLE_PORT)"

stack-seed: ## seed accounts and sample entries into stack STACK
	$(STACK_SETUP) scripts/seed.ts $(SEED_ARGS)

stack-check: ## verify email and RustFS uploads against stack STACK (needs Bun)
	bun run scripts/test-services.ts

stack-down: ## stop stack STACK (keeps its volumes)
	$(COMPOSE_STACK) down

stack-destroy: ## DELETE stack STACK and all its data; requires CONFIRM=<STACK>
	@[ "$(CONFIRM)" = "$(STACK)" ] || { echo "This deletes every volume of stack $(STACK). Re-run with CONFIRM=$(STACK)."; exit 1; }
	$(COMPOSE_STACK) --profile setup down -v --remove-orphans --rmi local

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

##@ Railway: read-only checks (target: PB_URL in deploy/railway/.env; see deploy/OPERATIONS.md)

railway-check-backups: ## is the latest scheduled backup fresh? reads listing metadata only
	@$(RAILWAY_RUN) read scripts/check-backups.ts

railway-verify-restore: ## compare deployment with a local restore; needs RESTORE_URL, DEPLOY_EVIDENCE_DIR
	@$(RAILWAY_RUN) read deploy/railway/verify-restore.ts

##@ Railway: MUTATING (each needs CONFIRM=<hostname of PB_URL>; most need DEPLOY_EVIDENCE_DIR)

railway-configure: ## WRITES settings: SMTP, sender, email links, rate limits, backup schedule
	@$(RAILWAY_RUN) write deploy/railway/configure.ts "$(CONFIRM)"

railway-backup: ## CREATES a backup archive on the deployment and downloads it
	@$(RAILWAY_RUN) write deploy/railway/backup.ts "$(CONFIRM)"

railway-verify-app: ## CREATES temporary users, a note and a file, then deletes them
	@$(RAILWAY_RUN) write deploy/railway/verify-app.ts "$(CONFIRM)"

railway-verify-signup: ## CREATES a temporary user to prove public signup is refused
	@$(RAILWAY_RUN) write deploy/railway/verify-signup.ts "$(CONFIRM)"

railway-verify-email: ## SENDS REAL EMAIL to VERIFY_EMAIL; needs RESEND_API_KEY
	@$(RAILWAY_RUN) write deploy/railway/verify-email.ts "$(CONFIRM)"
