# PocketBase Notes

A private notes and journaling app built with React, TanStack Router, PocketBase,
shadcn/ui and ProseKit. Write a thought, save it, and return to it later.

![PocketBase Notes on desktop](docs/images/notebook-desktop.png)

The interface at `/entries` uses shadcn’s `sidebar-09` and ProseKit’s full
editor block. See [component sources and adaptations](docs/design/prebuilt-ui.md).

## What works

- Rich-text notes and journals with lists, tables, links, code, math and image uploads.
- Private image/PDF/text attachments stored through PocketBase and RustFS, with protected downloads.
- Title search, favorites, journal date filters and paginated lists. Filters stay in the URL.
- Explicit Save, unsaved-change prompts and conflict detection when two tabs edit the same entry.
- Private PocketBase records with server-side document validation and ownership rules.
- Collapsible navigation and full-screen writing for new and saved entries.
- Mobile list/editor navigation, keyboard formatting and Ctrl/Cmd+S.
- Existing login, registration, verification and password-reset screens.

[Mobile screenshot](docs/images/notebook-mobile.png) ·
[Design and scope](docs/design/notes-journal.md) ·
[Verification](docs/VERIFICATION.md)

## Run locally

```sh
cp .env.example .env
openssl rand -base64 24  # set PB_ENCRYPTION_KEY in .env
make start
```

Set the superuser credentials and matching `PB_PORT` / `VITE_PB_URL` in `.env`.
`make start` starts PocketBase, seeds the development account, and runs Vite.
The default development login is `user@example.com` / `user-changeme-123`;
`SEED_USER_EMAIL` and `SEED_USER_PASSWORD` override it. Sample entries are added
only when that account's notebook is empty.

For email and S3-backed file storage, use `make start-full` instead. It configures
Mailpit and RustFS automatically; `make check-services` verifies both. See the
[full-stack setup](docs/DEVELOPMENT.md#full-stack-mailpit-smtp--rustfs-s3).

## Checks

```sh
bun install
bun run test:install  # install the pinned Playwright Chromium browser
make up-full         # configure PocketBase, Mailpit and RustFS
make smoke           # service checks + login/save/reload smoke test
make e2e             # full API and desktop/mobile browser coverage
```

Tests use disposable accounts against the local backend configured in `.env`.
Playwright starts and stops a separate Vite server automatically. Reports, traces
and screenshots stay in ignored test-output directories. No global Playwright
installation or manually started frontend is required.

Run `bun run lint` and `bun run build` for static checks, or `bun run test:report`
to open the browser report. See [testing details](docs/VERIFICATION.md).

## Boundaries

Entries are private through application access rules, not end-to-end encryption.
Drafts are in memory until Save; browser crashes can lose unsaved work. Conflict
recovery offers a plain-text copy and a confirmed reload, not automatic merging.
There is no sharing, AI or offline synchronization. See [attachments](docs/ATTACHMENTS.md)
for file limits, private storage and cleanup behavior.
OAuth providers and production email still require PocketBase configuration.
Local email delivery is captured by Mailpit in full-stack mode.

See [development setup](docs/DEVELOPMENT.md), [deployment](deploy/README.md),
and [root configuration](docs/ROOT-FILES.md).
