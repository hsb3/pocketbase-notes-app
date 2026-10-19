# Notebook verification

## Reproducible checks

- `bun run lint`: repository formatting and lint checks. Vendored agent-skill examples are excluded; application code remains checked.
- `bun run build`: both TypeScript configurations and the production frontend build.
- `bun run scripts/test-entries.ts`: live API checks for rich-text persistence, account isolation, owner/type spoofing, invalid documents/dates, conflicting concurrent saves, date/favorite filtering and deletion. Temporary accounts are cleaned up through the superuser API.
- `node --env-file=.env scripts/test-browser.cjs`: Playwright checks against the running Vite app. Requires Playwright/Chromium; a global installation can be resolved using `NODE_PATH`.

The browser check covers actual password login, bold text round trip, journal creation,
favorites, title search and date-filter persistence, unsaved-change decisions, concurrent
editing, failed saves retaining drafts, mobile navigation, confirmed deletion, sidebar collapse/expand and full-screen writing for both new and saved entries. The bold shortcut is verified not to toggle navigation.
The session-recovery check revokes an active token and verifies that reauthentication
preserves the draft. Screenshots
are captured at desktop and mobile sizes; test data is synthetic.

## Implementation evidence

The entries collection was created through the authenticated collection API with explicit
approval to use it instead of the admin UI. PocketBase generated the checked-in migration;
record types were regenerated through `make codegen`.

A disposable PocketBase container with document/date validation removed caused the API
suite to fail with “Missing expected rejection.” The working backend passed the same suite.
The disposable container was removed afterward; the application database was not mutated
for that negative check.

## Limits

Automated browser coverage does not substitute for a screen-reader audit or a physical-phone
keyboard test. OAuth and email delivery were not exercised. Kata could not register the work
because the current server did not recognize this repository alias. The original app is checkpointed in commit `7c91b47`; the prebuilt UI experiment is on
`feat/notebook-prebuilt-ui`. No deployment was performed.

## Adopted UI

The browser suite runs against the prebuilt interface at the default `/entries`
route. It verifies toolbar undo/redo and the complete note/journal flow. The former
layout and editor have been removed; the earlier checkpoint remains in Git history.
See [component sources](design/prebuilt-ui.md).

The browser suite also rejects duplicate sidebar controls and checks that the writing
area begins within 240px of the desktop viewport top and 260px on mobile.

## Mailpit and RustFS

`make check-services` verifies live SMTP delivery for verification and password-reset
messages, checks the React action URLs, consumes both tokens, and proves an avatar
upload exists in RustFS and downloads byte-for-byte through PocketBase. Its temporary
account and captured messages are removed afterward. The check first failed against
the previous SMTP-disabled configuration before the integration was added.

## Full editor and attachments

See [attachment checks](ATTACHMENTS.md#verification) for protected RustFS files, richer
document validation, image reloads, file downloads and slash/table browser coverage.

## RustFS replacement

The local migration copied the existing bucket over S3 with application writes
stopped, compared source/target object keys and downloaded bytes, and confirmed
the existing protected attachment remained readable through PocketBase. A separate
disposable instance passed PocketBase's S3 check and a protected 6 MiB file
upload/download/delete round trip. The normal service, attachment and browser
suites also run against RustFS. See [deployment](../deploy/README.md#storage-images-and-migration)
for migration and rollback boundaries.
