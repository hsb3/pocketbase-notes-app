# PocketBase Notes

PocketBase Notes is a self-hosted notebook. One Docker image serves the React app, the PocketBase API and the database. Sign in to open **All Notes**. Select **Compose** to start writing, or create a folder first to file the note there.

## What ships

- The first line of a note supplies its title. Writing pauses trigger autosave. **Saved** means the latest edits have reached the server.
- All Notes combines the account’s folders, newest edits first. Compose there files a new note in the permanent **Notes** folder.
- A phone shows one screen at a time. Tablet and desktop show folders, list and editor side by side. **Back** restores the originating list position.
- Light, dark and system themes are available. Account security includes optional two-step sign-in by email.

Search (R4), pinning in place of favorites (R7), Journal (R8), formatting controls (R9), Open Tasks (R10) and attachment controls (R11) are planned. See [notebook behavior](docs/features/notes.md) and [sign-in](docs/features/auth.md).

## Screenshots

The [recording](docs/images/core-loop.gif) and [phone screenshots](docs/images/mobile.png) in this repository show the previous entries interface. For current images, run `scripts/capture-screenshots.sh` without arguments. It captures the app in a disposable stack and prints the output directory. [Capture instructions](docs/testing/verification.md#results-and-debugging)

## Try it

Install [Docker](https://docs.docker.com/get-docker/) with Compose.

```sh
git clone https://github.com/hsb3/pocketbase-notes-app.git && cd pocketbase-notes-app
make app
```

`make app` creates `.env` with generated secrets, builds the image, starts the
app with local email (Mailpit) and file storage (RustFS), adds sample notes,
and prints the address and login (`http://127.0.0.1:8100`,
`user@example.com` / `user-changeme-123`). `make stack-down` stops it and keeps
the data. More in [local stacks](deploy/LOCAL.md).

## Develop

```sh
bun install
make start   # PocketBase in Docker, sample account, Vite with hot reload
```

`make start-full` adds Mailpit and RustFS for email and attachments. Setup,
seed accounts and every Makefile target: [development setup](docs/development/setup.md).
How the pieces fit: [tech stack](docs/architecture/tech-stack.md).

## Test

```sh
bun test tests/unit
bun run lint && bun run knip && bun run build
make test-api-contained
make test-browser-contained
```

Each contained command builds a fresh local stack and removes its containers, network and volumes. [Verification](docs/testing/verification.md) covers additional profiles. GitHub Actions runs its own hosted [CI checks](docs/ci/checks-and-rules.md).

## Deploy

Every target uses the same [Docker image](deploy/IMAGE.md). The [Railway guide](deploy/RAILWAY.md) covers the persistent volume, outgoing email and off-volume backups. Public signup defaults off. [Deployment options](deploy/README.md)

**Before upgrading an entries-based installation**, preserve a backup and the matching app. The R2 migration drops the legacy entries collection and its data. Existing folders and notes survive. See [rollback and restore](deploy/OPERATIONS.md#rollback).

## Boundaries

PocketBase access rules keep notes private between accounts. The server operator can read the database. Unsaved edits live in memory and a browser crash can lose them. A save error keeps the draft on screen and blocks in-app navigation. Offline sync, sharing, AI features and conflict recovery are outside this increment. [Save behavior](docs/features/notes.md)

Two-step sign-in and password resets require email delivery. The local full stack uses Mailpit. A deployed instance needs an SMTP provider. [Sign-in](docs/features/auth.md) · [Protected file limits and cleanup](docs/features/attachments.md)

## More

- Documentation site: <https://hsb3.github.io/pocketbase-notes-app/>
- [Contributing](CONTRIBUTING.md) · [Security policy](SECURITY.md) ·
  [Changelog](CHANGELOG.md) · [License (MIT)](LICENSE)

[![CI](https://github.com/hsb3/pocketbase-notes-app/actions/workflows/ci.yml/badge.svg)](https://github.com/hsb3/pocketbase-notes-app/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/hsb3/pocketbase-notes-app)](https://github.com/hsb3/pocketbase-notes-app/releases/latest)
[![License: MIT](https://img.shields.io/github/license/hsb3/pocketbase-notes-app)](LICENSE)
[![Docs](https://img.shields.io/badge/docs-site-blue)](https://hsb3.github.io/pocketbase-notes-app/)
