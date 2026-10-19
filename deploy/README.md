# Deployment

All targets use the shared frontend + PocketBase image. Run commands from the
repository root; Docker's build context must remain the root, not `deploy/`.

| File | Purpose |
| --- | --- |
| `docker/Dockerfile` | Native arm64/amd64 build; serves frontend and API |
| `local/docker-compose.yml` | PocketBase only: `make up` |
| `local/docker-compose-full.yml` | PocketBase, Mailpit and RustFS: `make up-full` |
| `railway/railway.json` | Railway build path, readiness check and restart policy |

## Local development

Copy `.env.example` to `.env`, generate `PB_ENCRYPTION_KEY`, set local superuser
credentials, and keep `VITE_PB_URL` aligned with `PB_PORT`. `make start` starts the
backend, seeds development accounts and starts Vite. `make start-full` additionally
configures local email and storage. Seeding resets the configured development
accounts' passwords; never run it against production.

The Makefile supplies `--project-directory .` so Compose mounts resolve correctly.
All published local service ports bind to loopback. PocketBase data lives in
`pb/data`; Mailpit messages and RustFS files live in named Docker volumes. Hooks and
migrations are mounted for development. The full stack mounts development scripts
and certificates read-only and forwards termination directly to PocketBase.

`make up-full` waits for healthy services, initializes the bucket and persists
SMTP/S3 settings in PocketBase. Afterward, keep using the full stack: `make up`
does not revert those settings or trust the Mailpit certificate. Changing a bucket
name does not migrate files. See [full-stack setup](../docs/DEVELOPMENT.md#full-stack-mailpit-smtp--rustfs-s3)
and [attachment storage](../docs/ATTACHMENTS.md).

Stop with `make down` or `make down-full`; do not use `docker compose down -v`
unless deleting the Mailpit/RustFS data is intended.

### RustFS storage

RustFS and its `rc` CLI use pinned, publicly pullable arm64/amd64 images. The
`storage-init` setup service creates the configured bucket idempotently. Files
live in the named `rustfs` volume and are accessed through PocketBase's protected
file API; browser code receives no S3 credentials.

`RUSTFS_ACCESS_KEY` / `RUSTFS_SECRET_KEY` configure the local API and console login;
`RUSTFS_BUCKET` selects the bucket. Defaults are documented in `.env.example`.
Production storage is configured separately in PocketBase. Changing an endpoint
or bucket does not copy files: back up, transfer and verify existing objects first.
The setup script refuses to overwrite a different active provider or bucket.

References: [RustFS Docker setup](https://docs.rustfs.com/en/installation/container/docker)
and [RustFS source](https://github.com/rustfs/rustfs).

## Shared image

```sh
docker build -f deploy/docker/Dockerfile -t notebook .
```

The build copies only frontend inputs, uses the frozen Bun lockfile, and excludes
local environment files and certificates. The runtime includes the frontend,
PocketBase hooks and migrations, with `/pb` as its working directory. It serves
on `0.0.0.0:8080`; its Docker healthcheck requests `/api/health`.

The production frontend uses same-origin API requests. Runtime `VITE_*` variables
do not change the already-built frontend; the development auth bypass is disabled
in production. Runtime state must be persisted at `/pb/pb_data`. Migrations run on
startup; take a backup before upgrades and retain the prior image for rollback.
Restoring an older image alone does not undo database migrations.

## Railway

Keep the service root directory at the repository root and set the custom
config-as-code path to `deploy/railway/railway.json`. The existing JSON selects the
shared Dockerfile and `/api/health`; no start-command override is needed.

Configure the service separately:

- Set `PB_ENCRYPTION_KEY` to a securely generated value and retain it across deploys.
- Mount a persistent volume at `/pb/pb_data`; this holds the database and, by default,
  attachment files. S3 storage does not eliminate the database volume requirement.
- Set `PORT=8080` and the public domain's target port to `8080`, matching the image's
  fixed listener and Railway's healthcheck port.
- Run a single instance with its volume. This SQLite-backed app is not configured
  for horizontal replicas or multiple writers sharing a database.
- Create the first superuser in the running container using PocketBase's
  `superuser create` command with `--encryptionEnv=PB_ENCRYPTION_KEY`. Do not run the
  local seed script or install the development accounts.
- In PocketBase settings, set the public application URL and a real SMTP provider
  for registration verification and password resets. Configure S3 there only if
  external file storage is needed; local volume storage also supports attachments.

Mailpit and RustFS Compose services are local development tools, not provisioned by
`railway.json`. Local `.env` credentials are not production service variables.
Configure backups for the database and files, and retain the encryption key
separately. Confirm restoration before relying on backups.

After deployment, check `/api/health`, refresh a frontend route such as `/entries`,
and verify account email delivery plus attachment save/download after a restart.
A healthcheck alone does not test SMTP, S3 or file access rules. Railway deployment
has not been exercised by this local review.

References: [Railway config as code](https://docs.railway.com/config-as-code),
[Railway healthchecks](https://docs.railway.com/deployments/healthchecks),
[PocketBase deployment](https://pocketbase.io/docs/going-to-production/).

## Updates and verification

PocketBase's server version and per-architecture checksums are pinned in the
Dockerfile; keep the JS SDK compatible and regenerate record types with
`make codegen` when updating the server. Image digests require deliberate updates.

```sh
docker compose --project-directory . -f deploy/local/docker-compose.yml config --quiet
docker compose --project-directory . -f deploy/local/docker-compose-full.yml config --quiet
make check-services
```

The service check needs the running full stack and exercises real email tokens,
file storage and download bytes. See [application verification](../docs/VERIFICATION.md)
for editor and private-attachment tests.
