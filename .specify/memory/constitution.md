# PocketBase Notes Constitution

Derived from `AGENTS.md` and `.agents/context/feature-workflow.md`. Those files stay the
source of truth; if they disagree with this document, they win and this file is amended.

## Core Principles

### I. Backend before frontend

A feature that changes PocketBase (schema, API rules, `pb/hooks/`, server settings) MUST land
its backend first: a committed migration in `pb/migrations/` (never edit an applied one), then
`make codegen` to regenerate `src/services/pocketbase-types.ts`. Frontend types come from the
schema, so the order is not optional.

### II. Locked by default, enforced on the server

Every collection ships with all five API rules deliberately decided; empty string is public,
`null` is superuser-only. Values a client could forge (counts, revisions, derived indexes) MUST
be computed in server hooks, not trusted from the request. Custom routes do their own auth.
Denied requests are tested as well as the happy path, including cross-account isolation.

### III. Never lose a user's words

Saves go through the entry `revision` check (HTTP 409 on a stale revision). Any new write path
to an entry MUST reuse that check rather than bypass it, so an editor's unsaved draft is never
silently overwritten.

### IV. Smallest complete change, no new dependencies

Reuse what the codebase has (shadcn primitives in `src/components/ui/`, `pb` from
`src/services/pocketbase.ts`, existing feature folders). No new npm dependencies without the
owner's approval. Generated files (`route-tree.gen.ts`, `pocketbase-types.ts`) are outputs,
never hand-edited.

### V. Verified for real

`bun run lint` and `bun run build` MUST exit 0. Behaviour is exercised against a live stack
(API tests in `scripts/`, Playwright in `tests/e2e/`, chromium + webkit, desktop + mobile).
A type-checked build proves shapes, not behaviour; anything not exercised is reported as such.

## Product constraints

- React 19 + TanStack Router (file routes under `src/routes/`, auth-gated under
  `src/routes/_authenticated/`), PocketBase 0.40.x paired with the JS SDK ^0.28.
- New domain concept = new `src/features/<name>/` directory.
- UI works at the mobile viewport, is keyboard accessible, and is legible in dark mode.
- Servers and stacks run only in resource-limited Docker containers, never bare on the host.

## Development workflow

Stage 0 acceptance criteria → Stage 1 backend (if PocketBase is touched) → Stage 2 frontend →
Stage 3 verify and close, as described in `.agents/context/feature-workflow.md`. The spec-kit
artefacts under `specs/` carry Stage 0 and the plan; the PR body carries the verification
evidence and known gaps.

## Governance

This constitution is a summary of `AGENTS.md` and the feature workflow; amend those first,
then this file. Reviews check a PR against the principles above. Versioning: MAJOR for removed
or redefined principles, MINOR for added ones, PATCH for wording.

**Version**: 1.0.0 | **Ratified**: 2026-11-15 | **Last Amended**: 2026-11-15
