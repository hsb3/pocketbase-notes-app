# Adding a feature

One procedure for all features. Every feature runs the shared stages; features that
touch PocketBase run the backend stage as well. The discriminator is not
"frontend vs fullstack" — it is **"does this change PocketBase?"** (schema, API
rules, hooks in `pb/hooks/`, or server settings). Backend-only changes (rules
hardening, hooks) use the same procedure minus the frontend stage.

## Stage 0 — Track it (always)

- Search kata for an existing issue; otherwise create one with independently
  verifiable acceptance criteria. Full conventions: [kata.md](kata.md).
- One feature = one kata issue (children for delegated slices).

## Stage 1 — Backend (only if the change touches PocketBase)

Do this **before** frontend work — the frontend types are generated from the schema.

1. **Schema changes go through the local admin UI** (`make up`, then the `_/`
   dashboard). PocketBase auto-generates a JS migration file into `pb/migrations/`
   (volume-mounted). **Commit that file** — it is the schema's source of truth;
   the prod image copies `pb/migrations/` in at build time. Never edit
   `pb/data/` state directly or treat it as the record.
2. **Set API rules at collection creation, never later.** Start locked, open
   selectively. Trap: a rule left **empty-string is PUBLIC**; only `null`
   (unset) means superuser-only. Every new collection ships with all five rules
   deliberately decided. Denials return 200-empty or 404, never 403 — so an
   accidentally-public rule looks fine in the happy path.
3. **Custom routes in `pb/hooks/` bypass collection rules entirely.** Any custom
   endpoint does its own auth check.
4. **Regenerate types**: `make codegen` (backend must be up and seeded). Commit
   the updated `src/services/pocketbase-types.ts`. Never hand-edit it.
5. If the feature needs data to be exercisable locally, extend `scripts/seed.sh`.

Deeper backend design questions (field types, relations, indexes, filter
injection): the `pocketbase-best-practices` skill, if your harness has it.
Minimum to know without it: use relation fields not ID strings, use
`pb.filter()` binding for any user-supplied filter value, expand relations
instead of N+1 fetches.

## Stage 2 — Frontend (skip only for backend-only changes)

1. **New domain concept = new `src/features/<name>/` directory** holding its
   components and feature-specific hooks. Shared hooks go in `src/hooks/`,
   shared utilities in `src/utils/`.
2. Routes are files in `src/routes/` (TanStack file-based routing;
   `src/route-tree.gen.ts` regenerates on dev/build — never hand-edit).
   Auth-gated pages go under `src/routes/_authenticated/`.
3. UI primitives come from shadcn (`bunx shadcn@latest add <component>`) into
   `src/components/ui/` — don't hand-roll what shadcn ships.
4. Talk to PocketBase only through `pb` from `src/services/pocketbase.ts`,
   using the generated collection types.

## Stage 3 — Verify and close (always)

- `bun run lint` and `bun run build` both exit 0.
- Exercise the feature against a live stack (`make start`) — a type-checked
  build proves shapes, not behavior. If behavior can't be exercised, say so
  in the close message instead of implying it was.
- Close the kata issue with evidence (`--test`, `--reviewed`) per kata.md.

## Constraints that apply to every stage

- No new dependencies without explicit approval; `package.json` and the root
  configs are read-only for delegated agents.
- Generated files (`route-tree.gen.ts`, `pocketbase-types.ts`) are outputs,
  never inputs.
- PocketBase server (0.40.x, pinned in `deploy/docker/Dockerfile`) and the JS
  SDK (^0.28) version-couple: bump together, then `make codegen`.
