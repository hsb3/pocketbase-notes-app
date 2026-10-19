# PocketBase Notes handoff

Updated: 2026-10-19. Integration branch: `main`.

## Current state

Private notes/journaling app built with React, TanStack Router, shadcn,
ProseKit and PocketBase. The prebuilt UI is the sole active interface: collapsible
sidebar, full-width writing mode, compact header and bottom word-count rail.
The prior custom UI remains in Git history, not runtime routes.

The full ProseKit registry editor replaces the basic toolbar editor. Formatting,
slash commands, tables, code/math, resizable images and attachment upload/download
are connected to saved entries. Explicit Save and unsaved-navigation guards remain.
Sharing, collaboration, AI and offline sync are not implemented; no env flags enable
them. `.env.example` documents every app/service/test environment setting.

Local Mailpit and RustFS integration is implemented and verified. Use
`make start-full` (or `make up-full` plus `make dev`) for the configured local stack.
The running development session uses Vite on port 5173; backend host port comes
from the ignored `.env`. No production deployment was performed.

## Decisions and safety contracts

- Prefer upstream prebuilt blocks; the full editor comes from
  `@prosekit/react-example-full`. Demo documents and fake people/tag suggestions
  are not loaded. Source notices are in `docs/design/prebuilt-ui.md`.
- Attachments upload through PocketBase into protected records; RustFS credentials
  never reach the browser. Persist stable `attachment:<id>` image references,
  never signed URLs or blob URLs. See `docs/ATTACHMENTS.md` for the contract.
- Entry create/update transactions validate attachment ownership and references.
  Existing revision checks reject stale saves. Referenced files cannot be deleted.
- Abandoned uploads are collected hourly after the documented grace period;
  unsaved drafts remain memory-only. Conflict copy-text recovery excludes files
  and formatting; download unsaved files before discarding a conflicting draft.
- SMTP/S3 are persisted PocketBase settings. Switching to `make up` does not
  disable them. Full-stack setup refuses existing local files or a changed active
  bucket; changing environment values is not a storage migration.
- Keep `PB_ENCRYPTION_KEY` stable. Secrets, backend data and dev TLS certificates
  remain ignored. Production SMTP/S3 providers need separate configuration.

## Verification completed

Passed against the local backend during this session:

- `bun run lint`, `bun run build`, `bunx tsc -p scripts/tsconfig.json`.
- `make check-services`: verification/reset email delivery and token use through
  Mailpit, plus real RustFS file storage and retrieval.
- `bun run scripts/test-entries.ts`: persistence, validation, account isolation,
  revision conflicts and concurrent updates.
- `bun run scripts/test-attachments.ts`: rich document round trip, protected
  downloads, cross-account denial, file/URL validation and reference-safe deletion.
  Cleanup selection uses fixture SQL; the live cleanup job retained a fresh upload.
- `bunx playwright test notebook`: saves, navigation, conflict and
  expired-session recovery, sidebar/calendar collapse, focus mode and mobile layout.
- `bunx playwright test attachments`: upload before first save,
  private images after reload, download bytes, tables, removal and rejected files.
  Install Chromium with `bun run test:install`. Browser runs manage their own Vite
  server and put artifacts in ignored `test-results/` and `playwright-report/`.

The smoke test was verified to fail against an isolated app copy that saved the
wrong title. Failure artifacts were produced and its test user was cleaned up.
The normal smoke and complete API/browser suites passed.

CI is defined in `.github/workflows/ci.yml`; `docs/CI.md` describes the required
quality and amd64/arm64 integration checks plus admin-enforced PR/force-push rules.
GitHub ruleset definitions are tracked in `.github/rulesets/`.

## Known caveats and next session

RustFS powers local object storage. `make smoke` and `make e2e` run live service
and browser checks; setup and coverage are in `docs/VERIFICATION.md`.
Repository: `https://github.com/hsb3/pocketbase-notes-app` (public source code).
Notes and files remain private through PocketBase access rules. The full editor adds a large lazy
bundle; Vite's chunk-size warning remains. Real-time collaboration and public
sharing would require new product/backend work, not a configuration change.

Kata was unavailable: the local repository alias was not registered, so this work
has no newly created tracker item. Do not infer tracker completion or active
handoff-hook certification from this file.

PocketBase schema changes were made through the authenticated collection API with
explicit approval because no interactive browser was available; generated migrations
are retained. Record types were regenerated using `make codegen`. Do not hand-edit
`src/services/pocketbase-types.ts` or `src/route-tree.gen.ts`.

Internal multi-relation reference queries must use `attachments.id ?= {:id}`;
`attachments ?= {:id}` did not perform the intended membership check. The attachment
regression test covers deletion while referenced.

## Map

- `docs/DEVELOPMENT.md`: local stack and commands.
- `docs/ROOT-FILES.md` and `.env.example`: configuration and settings boundaries.
- `docs/ATTACHMENTS.md`: editor, uploads, privacy, cleanup and test contract.
- `docs/VERIFICATION.md`: application verification coverage.
- `pb/hooks/`: entry validation, revision checks and attachment cleanup.
- `pb/migrations/`: retained generated users/entries/attachments schema changes.
