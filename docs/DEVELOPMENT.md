# Development

## Quick start

```sh
cp .env.example .env
openssl rand -base64 24   # paste output into PB_ENCRYPTION_KEY in .env
make start                # backend up + seed + vite dev server
```

`make start` runs `make up` (PocketBase in Docker), `make seed` (superuser +
verified test user), then `bun dev`. Requires [Docker](https://docs.docker.com/get-docker/)
and [Docker Compose](https://docs.docker.com/compose/install/). `PB_ENCRYPTION_KEY`
must stay secret and stable — rotating it makes previously encrypted settings
unreadable.

Other Makefile targets: `make up` / `make down` / `make logs` / `make health`
run PocketBase alone; `make dev-solo` runs the frontend with
`VITE_AUTH_BYPASS=true` so you can work on UI without a backend at all
(dev builds only — dead code in production).

## Full stack: Mailpit (SMTP) + MinIO (S3)

```sh
make start-full       # configured backend + Mailpit + MinIO + seed + Vite
# Or, when Vite is already running:
make up-full
make check-services
```

`make up-full` generates the local SMTP certificate if absent, waits for all
services to be healthy, creates the MinIO bucket idempotently, and configures
PocketBase through its authenticated settings API. It creates the superuser
only on a fresh database; it does not reset an existing superuser password.
Set `PB_EMAIL`, `PB_PASSWORD`, `PB_ENCRYPTION_KEY`, and matching
`PB_PORT` / `VITE_PB_URL` in `.env` first.

- Mailpit inbox: http://127.0.0.1:8025
- MinIO console: http://127.0.0.1:9001
- PocketBase admin: the `VITE_PB_URL` address with `/_/` appended

Mailpit captures messages locally; nothing is relayed to real recipients.
PocketBase connects to `mailpit:1025` using STARTTLS and the trusted development
certificate installed by `scripts/start.sh`. Verification/reset email templates
point to the React app. `DEV_APP_URL` defaults to `http://127.0.0.1:5173`; change it
if the frontend runs elsewhere.

MinIO stores PocketBase file fields, including user avatars. The bucket defaults
to `pocketbase`, configurable with `MINIO_BUCKET`. Console/API credentials use
`MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`, both defaulting to `pocketbase` for local
development. The S3 endpoint inside Docker is `http://minio:9000`, region
`us-east-1`, with path-style addressing. Mailpit and MinIO ports bind to loopback.
The full editor uses this storage for [private note attachments and images](ATTACHMENTS.md).

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
MinIO, and compares downloaded bytes. It deletes its account, file and test emails.
It uses no external email service or new application dependencies.

These settings are development-only and are not embedded in the production image.
Configure real SMTP/S3 services separately in production; local filesystem storage
remains available there. The email-template migration uses `{APP_URL}`, so set the
PocketBase application URL to the public frontend address in each environment.
