# Improve: adding a feature

One procedure for all features. Every feature runs the shared stages; features that
touch PocketBase run the backend stage as well. The discriminator is not
"frontend vs fullstack" — it is **"does this change PocketBase?"** (schema, API
rules, hooks in `pb/hooks/`, or server settings). Backend-only changes (rules
hardening, hooks) use the same procedure minus the frontend stage.

## Stage 0 — Define the outcome (always)

- Define independently verifiable acceptance criteria in the conversation.
- Read Spec and any matching file in Designs (improve docs, listed below) so the
  change stays inside the product's boundaries.
- Write them before any code, as user stories with **Given / When / Then**
  scenarios. Each story should be testable on its own; mark the minimum useful
  slice.
- List **edge cases** next to them: denied and cross-account access, concurrent
  or stale saves (the `revision` 409 path), empty and oversized input, existing
  data that needs a backfill, values a client could forge. Each one becomes a test
  or a stated gap.
- Name what the feature deliberately is **not**; it goes in the feature doc.
- **Gate before building**: check the plan against the hard limits in
  `AGENTS.md` and the stages below (backend first, locked rules, server-derived
  values, no new dependencies, generated files untouched). Write down any
  exception and why; an unexplained one stops the work.

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
   deliberately decided. List-rule denials return an empty list; view/update/delete-rule denials return
   404, create-rule denials return 400, and locked rules return 403. Verify
   denied requests as well as the happy path.
3. **Custom routes in `pb/hooks/` bypass collection rules entirely.** Any custom
   endpoint does its own auth check.
4. **Regenerate types**: `make codegen` (backend must be up and seeded). Commit
   the updated `src/services/pocketbase-types.ts`. Never hand-edit it.
5. If the feature needs data to be exercisable locally, extend `scripts/seed.sh`.

Deeper backend design questions (field types, relations, indexes, filter
injection): the `pocketbase-best-practices` skill, when available.
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
   `src/components/ui/` — don't hand-roll what shadcn ships. The vendored shadcn
   skill is in `.agents/skills/shadcn/`. Editor UI lives in `src/components/editor/`
   (ProseKit). Theme (light, dark, system) is `src/features/theme/`; style with its
   tokens, and check new UI in both themes.
4. Talk to PocketBase only through `pb` from `src/services/pocketbase.ts`,
   using the generated collection types.

## Stage 3 — Verify and close (always)

- `bun run lint`, `bun run knip` and `bun run build` all exit 0.
- Add or extend tests where Verification says that kind of behaviour is covered.
- Exercise the feature against a live stack (`make start`) — a type-checked
  build proves shapes, not behavior. If behavior can't be exercised, say so
  in the close message instead of implying it was.
- Report the verification evidence and any remaining gaps in the conversation
  and the pull request.
- Add a line under `Unreleased` in `CHANGELOG.md` when users or operators would
  notice the change.

## Constraints that apply to every stage

- No new dependencies without explicit approval; `package.json` and the root
  configs are read-only for delegated agents.
- Generated files (`route-tree.gen.ts`, `pocketbase-types.ts`) are outputs,
  never inputs.
- The PocketBase server/SDK version coupling is a hard limit in `AGENTS.md`.
