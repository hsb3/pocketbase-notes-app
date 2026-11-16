# Local stacks

Three Compose files cover three needs. All bind their ports to loopback only,
and every service has CPU, memory and process limits.

| Command | Use it to | Host needs | Data lives in |
| --- | --- | --- | --- |
| `make app` | Run the finished app | Docker | Docker volumes named `<STACK>_*` |
| `make start` | Develop with hot reload | Docker, Bun | `pb/data` in the checkout |
| `make start-full` | Develop email and file storage | Docker, Bun | `pb/data` plus Mailpit and RustFS volumes |

Each of these creates `.env` from `.env.example` when it is missing and
generates `PB_ENCRYPTION_KEY` and `PB_PASSWORD` when they are empty. Values you
set are never changed. Run `make env` to do only that step.

## Self-contained stacks

`make app` builds the image with the frontend, hooks and migrations baked in,
starts PocketBase, Mailpit and RustFS, configures email and storage, seeds a
demo account with sample notes, and prints the address and login:

```sh
cp .env.example .env   # optional: make app does this when .env is missing
make app
```

Nothing is mounted from the checkout, and setup runs in a container, so moving
or switching the repository does not affect a running stack. Rebuild with
`make app` to pick up code changes; data is kept.

| Command | Effect |
| --- | --- |
| `make app` | Build, start, configure, seed, print URL and login |
| `make stack-up` | Same without seeding demo accounts |
| `make stack-seed` | Create missing demo accounts; `SEED_ARGS=--reset-passwords` resets them |
| `make stack-check` | Email and storage round trip (runs on the host, needs Bun) |
| `make stack-logs` | Follow PocketBase logs |
| `make stack-down` | Stop; volumes are kept |
| `make stack-destroy CONFIRM=<STACK>` | Stop and delete the stack's volumes and images |

Run several stacks side by side by giving each a name and ports:

```sh
make app STACK=demo STACK_PORT=8200 STACK_MAILPIT_PORT=8201 STACK_RUSTFS_CONSOLE_PORT=8202
```

Defaults are `STACK=pocketbase-notes`, `STACK_PORT=8100`,
`STACK_MAILPIT_PORT=8125` and `STACK_RUSTFS_CONSOLE_PORT=9101`. Pass the same
values to every later `stack-*` command, or set them in `.env`.

The superuser from `PB_EMAIL` / `PB_PASSWORD` is created when the database is
new. Changing those values later does not change the existing account.

## Development stacks

`make start` runs PocketBase alone and mounts `pb/hooks` and `pb/migrations`
from the checkout. `make start-full` adds Mailpit and RustFS and persists SMTP
and S3 settings in PocketBase. After that, keep using the full stack:
`make up` does not revert those settings or trust the Mailpit certificate.
Details are in [Development](../docs/development/setup.md).

Stop with `make down` or `make down-full`. Do not run `docker compose down -v`
unless you intend to delete the Mailpit and RustFS data.

To run a second checkout at the same time, change `PB_PORT`, `VITE_PB_URL`,
the `MAILPIT_*` and `RUSTFS_*` ports and the `*_CONTAINER` names in its `.env`;
`.env.example` lists them.

## RustFS storage

RustFS and its `rc` client use pinned arm64/amd64 images. The `storage-init`
one-shot service creates the bucket idempotently. Files live in the `rustfs`
volume and are served only through PocketBase's protected file API; browser
code receives no S3 credentials.

`RUSTFS_ACCESS_KEY` and `RUSTFS_SECRET_KEY` set the local API and console
login; `RUSTFS_BUCKET` selects the bucket. Changing an endpoint or bucket does
not copy files, and the setup script refuses to overwrite a different active
provider or bucket. See [attachment storage](../docs/features/attachments.md).

## Check the Compose files

```sh
docker compose --project-directory . -f deploy/local/docker-compose.yml config --quiet
docker compose --project-directory . -f deploy/local/docker-compose-full.yml config --quiet
docker compose --project-directory . -p check -f deploy/local/docker-compose-stack.yml --profile setup config --quiet
```
