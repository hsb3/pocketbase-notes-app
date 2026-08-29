# Project

React 19 + TanStack Router frontend, PocketBase backend, built with Bun and Vite.

- **Version coupling**: PocketBase server 0.40.x (pinned with per-arch SHA256 in
  `deploy/docker/Dockerfile`) pairs with the `pocketbase` JS SDK ^0.28 in
  `package.json`. Bump both together, then regenerate types (`make codegen`).
- **Generated files — never hand-edit**: `src/route-tree.gen.ts` (TanStack Router
  plugin, written on `bun dev`/`bun run build`) and `src/services/pocketbase-types.ts`
  (pocketbase-typegen, written by `make codegen` against a running, seeded backend).
- **Layout**: deployment lives under `deploy/` by target — `deploy/docker/Dockerfile`
  (shared multi-arch image: frontend build + PocketBase), `deploy/local/` (compose files,
  driven via Makefile from the repo root), `deploy/railway/railway.json` (config-as-code;
  Railway needs `PB_ENCRYPTION_KEY` and a volume at `/pb/pb_data`).
- **Config docs**: `docs/CONFIG.md` explains every root config file; keep it in sync
  when configs change.

## Commands

- `make start` — backend up + seed + vite dev server (reads `.env`; `PB_PORT` may differ from 8080)
- `make up` / `make up-full` / `make down` / `make logs` / `make health`
- `make seed` — superuser + verified test user (PB 0.23+: `_superusers`, not "admins")
- `bun run lint` (Biome — owns unused-variable checks; tsc does not), `bun run build`
  (type-checks both tsconfigs, then vite build)

## Gotchas

- PocketBase CLI subcommands run inside the container need `--encryptionEnv=PB_ENCRYPTION_KEY`
  (see `scripts/seed.sh`).
- The default `users` collection has no `username` field (removed in PB 0.23+); identity
  for `authWithPassword` is email.
- `bunfig.toml` enforces a 7-day cooldown on newly published package versions;
  postinstall scripts run only for `trustedDependencies` in `package.json`.

## Task management

Kata is the system of record for tasks and intent. Full conventions (workflow,
work.* signals, delegation, closing evidence): `.agents/context/kata.md`.
Shared agent context files live in `.agents/context/`.
