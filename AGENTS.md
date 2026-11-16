# AGENTS.md — PocketBase Notes

A private notes and journal app: React 19 + TanStack Router frontend, PocketBase
backend, built with Bun and Vite, shipped as one Docker image. This file holds only
the rules every task needs. Task details live in routed topics under
`.agents/context/`; load the one that matches your task.

## Always applies

- **Keep the docs true.** Verify descriptive claims against code and tests, then fix
  stale docs. A conflict with a hard limit, safety rule or intended requirement is not
  permission to weaken that rule: surface it to the owner. When your change alters
  behaviour that a topic or human doc describes, update it in the same change. Keep
  task-specific lessons in their topic; promote a one-line rule here only when every
  task needs it. Run `python3 scripts/ai-context.py check` (and `bun run docs:build` for human docs) after any doc change. The
  procedure is the `ai-context` topic. When a root config file changes, update
  `docs/development/root-files.md` in the same change.
- **Topics point, human docs explain.** Topic pages are short and link to `docs/`,
  `deploy/`, `CONTRIBUTING.md`. Put facts in the human doc, not in a topic; every doc
  path a topic needs is listed once in `.agents/context/docs.md`.
- **Search before you edit, and change as little as possible.** Match existing style.
- **Scope lives in the conversation.** This project uses no task tracker or handoff
  file. Agree acceptance criteria in the conversation and report verification evidence
  there and in the pull request.
- **Helper files go in the repo.** Scripts in `scripts/`, deployment helpers in
  `deploy/<target>/`. Scratch output stays outside the repo.

## Layout

- `src/features/<name>/` per domain (`auth`, `entries`, `theme`); `src/routes/` file
  routes (auth-gated under `_authenticated/`); `src/components/ui/` shadcn primitives;
  `src/services/pocketbase.ts` the only PocketBase client.
- `pb/hooks/` and `pb/migrations/` backend (migrations are the schema record);
  `scripts/` setup, seed and test scripts; `tests/e2e/` Playwright.
- `deploy/docker/` shared image, `deploy/local/` Compose files (run via `make` from
  the repo root), `deploy/railway/` operator scripts; `docs/` human docs.

## Hard limits

- Never hand-edit generated files: `src/route-tree.gen.ts` (TanStack Router plugin,
  written by `bun dev`/`bun run build`) and `src/services/pocketbase-types.ts`
  (`make codegen` against a running, seeded backend).
- PocketBase server 0.40.x (pinned with per-arch SHA-256 in `deploy/docker/Dockerfile`)
  pairs with the `pocketbase` JS SDK ^0.28 in `package.json`. Bump both together,
  then `make codegen`.
- Never commit secrets, `.env` files or real user data. `PB_ENCRYPTION_KEY` must stay
  stable: changing it makes encrypted settings unreadable.
- Keep `bunfig.toml`'s 7-day release-age cooldown. Postinstall scripts run only for
  `trustedDependencies` in `package.json`. New dependencies need a stated reason.
- `main` changes only through pull requests; never force-push. Deployment commands
  (`make railway-*`, `railway up`) act on a real instance: never run them unless the
  owner asked for that deployment action.

## Load context per task

```sh
python3 scripts/ai-context.py list      # topics and when to pick them
python3 scripts/ai-context.py <topic>   # print only that topic's sections
python3 scripts/ai-context.py check     # validate paths, headings, links, budgets
```

| Topic | Use when |
|---|---|
| `build` | Setting up, running or testing the app locally |
| `maintain` | Dependency or PocketBase bumps, releases, deploy operations, backups, CI |
| `improve` | Adding a feature, changing the schema or API rules, UI work |
| `ai-context` | Adding, moving or splitting agent docs and topics; `check` failures |
| `ai-context-advanced` | Shared router install or mounting another router tree (unused today) |

Pick the single closest topic. Load a second only when the task really crosses two.
When no topic fits, read `.agents/README.md`. If routed context is incomplete or
contradictory, inspect the relevant source, code or tests before acting.

To add a topic: put the page in `.agents/context/`, map it in
`.agents/context/ai-context.json`, list it in this table and in `.agents/README.md`,
run `check`. If a topic goes over budget, split it rather than raising the cap.
Skills (`.agents/skills/`) are workflow adapters, not the source of truth.

## Gotchas

- PocketBase 0.23+: superusers live in `_superusers` (not "admins"); the default
  `users` collection has no `username`, so `authWithPassword` identity is email.
- PocketBase CLI subcommands inside the container need
  `--encryptionEnv=PB_ENCRYPTION_KEY` (see `scripts/seed.ts`).
- Biome owns unused-variable checks; `tsc` does not. knip owns unused files, exports
  and dependencies.

## Verification

```sh
bun run lint    # Biome
bun run knip    # unused files, exports, dependencies
bun run build   # type-checks both tsconfigs, then vite build
python3 scripts/ai-context.py check    # after doc/topic changes
```

Behaviour changes also need the live-stack tests in the `build` topic.
