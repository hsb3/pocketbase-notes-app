# Development

## Quick start

Pick the one that matches what you are doing. `make help` shows the same
choice at the top.

| Goal | Command | Host needs |
| --- | --- | --- |
| Just run the app | `make app` | Docker |
| Work on the code | `make start` | Docker, Bun |
| Work on email or attachments | `make start-full` | Docker, Bun |

```sh
make start   # backend up + seed + Vite dev server
```

Each of these creates `.env` from `.env.example` when it is missing and
generates the empty secrets (`PB_ENCRYPTION_KEY`, `PB_PASSWORD`). Values you
set are never overwritten; `make env` runs only this step. `PB_ENCRYPTION_KEY`
must stay secret and stable: changing it makes previously encrypted settings
unreadable.

`make start` runs `make up` (PocketBase in Docker), `make seed` (superuser +
verified test user), then `bun dev`. Requires [Docker](https://docs.docker.com/get-docker/)
with [Docker Compose](https://docs.docker.com/compose/install/), and
[Bun](https://bun.sh) after `bun install`.

`make app` runs the built app, Mailpit and RustFS in Docker with nothing
mounted from the checkout, seeds it, and prints the address and login. See
[local stacks](../../deploy/LOCAL.md#self-contained-stacks).

Other Makefile targets: `make up` / `make down` / `make logs` / `make health`
run PocketBase alone; `make dev-solo` runs the frontend with
`VITE_AUTH_BYPASS=true` for UI work without a backend
(dev builds only — dead code in production).

## Full stack: Mailpit (SMTP) + RustFS (S3)

```sh
make start-full       # configured backend + Mailpit + RustFS + seed + Vite
# Or, when Vite is already running:
make up-full
make check-services
```

`make up-full` generates the local SMTP certificate if absent, waits for all
services to be healthy, creates the RustFS bucket idempotently, and configures
PocketBase through its authenticated settings API. It creates the superuser
only on a fresh database; it does not reset an existing superuser password.
Keep `PB_PORT` and `VITE_PB_URL` in `.env` in step.

- Mailpit inbox: http://127.0.0.1:8025 (`MAILPIT_PORT`)
- RustFS console: http://127.0.0.1:9001 (`RUSTFS_CONSOLE_PORT`)
- PocketBase admin: the `VITE_PB_URL` address with `/_/` appended

Mailpit captures messages locally; nothing is relayed to real recipients.
PocketBase connects to `mailpit:1025` using STARTTLS and the trusted development
certificate installed by `scripts/start.sh`. Verification/reset email templates
point to the React app. `DEV_APP_URL` defaults to `http://127.0.0.1:5173`; change it
if the frontend runs elsewhere.

RustFS stores PocketBase file fields, including user avatars. The bucket defaults
to `pocketbase`, configurable with `RUSTFS_BUCKET`. Console/API credentials use
`RUSTFS_ACCESS_KEY` / `RUSTFS_SECRET_KEY`, both defaulting to `pocketbase` for local
development. The S3 endpoint inside Docker is `http://rustfs:9000`, region
`us-east-1`, with path-style addressing. Mailpit and RustFS ports bind to loopback.
To run two checkouts at once, give the second one its own ports and container
names in `.env`; `.env.example` lists the variables.
The full editor uses this storage for [private note attachments and images](../features/attachments.md).

The setup script refuses to overwrite another enabled SMTP/S3 provider or change
an active S3 bucket. It also refuses to enable S3 over existing local uploads:
those files need migration first. Bucket contents and Mailpit messages persist in
Docker volumes; startup never empties them.

After configuring these services, restart with `make up-full` / `make start-full`,
and stop with `make down-full`. `make up` / `make start` are the original
PocketBase-only mode: they do not undo persisted SMTP/S3 settings and do not load
the Mailpit certificate. Do not switch to that mode while relying on these services.

`make check-services` creates a disposable account, requests verification and
password-reset emails, reads those messages through Mailpit's API, consumes both
tokens, uploads an avatar through PocketBase, checks that its object exists in
RustFS, and compares downloaded bytes. It deletes its account, file and test emails.
It uses no external email service or new application dependencies.

These settings are development-only and are not embedded in the production image.
Configure real SMTP/S3 services separately in production; local filesystem storage
remains available there. The email-template migration uses `{APP_URL}`, so set the
PocketBase application URL to the public frontend address in each environment.


## Seed accounts without unintended resets

`make seed` and `make stack-seed STACK=<name>` create missing local seed accounts
and verify their credentials. Existing passwords, verification status and profile
fields are preserved. A credential mismatch fails with a message instead of
resetting the account. Supply the current local credentials to continue.
`make seed` runs with Bun on the host; `make stack-seed` and `make app` run the
same script in the stack's setup container.

An intentional development password reset uses
`make seed SEED_ARGS=--reset-passwords` (or the same option with `stack-seed`).
Only the configured seed accounts are affected; profile/verification fields stay
unchanged. Seeding refuses non-loopback URLs, and any superuser CLI write requires
`PB_CONTAINER` to publish PocketBase on the configured loopback port. In a
self-contained stack the PocketBase service itself creates the superuser when
it is absent, so resetting the superuser password there is a dashboard task. The entries
seed command adds sample entries only to an empty existing seed account.
