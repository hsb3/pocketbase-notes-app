# Build: set up, run and test locally

Use for running or testing the app locally. Facts live in the build
docs listed below; this page is the order to do things in.

## Rules

- Servers and stacks run in Docker (the repo's Compose files set CPU, memory and
  process limits). Bounded commands (lint, knip, build, unit scripts) run on the host.
- Parallel or long-lived instances use a named stack: `make app STACK=<name>` with its
  own ports (see Local stacks). Stop what you started: `make down`, `make down-full`
  or `make stack-down STACK=<name>`. `make stack-destroy` deletes data and needs
  `CONFIRM=<STACK>`.
- `make seed` creates missing accounts and preserves existing passwords; resetting
  them needs `--reset-passwords` (via `SEED_ARGS`), only when asked.
- `make start` reads `.env`; `PB_PORT` may differ from 8080.

## Steps

For verification alone, start at step 4. The contained tests provision their own services.

1. `bun install`. `.env` is created from `.env.example` by `make env`, `make app`,
   `make start` or `make up*`; existing values are kept.
2. Pick one entry point (Development):
   - `make app` — whole app in Docker, seeded, prints URL and login. Rebuild with
     `make app` to pick up code changes.
   - `make start` — PocketBase in Docker + seed + Vite dev server.
   - `make start-full` — adds Mailpit (email) and RustFS (S3 files).
   - `make dev-solo` — frontend only, auth bypassed, for UI work without a backend.
3. Health and logs: `make health`, `make logs`.
4. Run `bun test tests/unit`, lint, knip, build and the scripts TypeScript check (Verification).
5. Run `make test-api-contained` and `make test-browser-contained`. Verification lists the profiles for account, restore, operator, signup, capture and workload checks.
6. A type-checked build proves shapes, not behaviour. If you could not exercise a
   change live, say so in your report.
