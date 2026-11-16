# Deployment

One image serves both the frontend and the PocketBase API. Every target below
builds it from `deploy/docker/Dockerfile` with the repository root as the build
context, so run all commands from the repository root.

| I want to… | Read | Start with |
| --- | --- | --- |
| Run the app on my machine | [Local stacks](LOCAL.md) | `make app` |
| Work on the code | [Development](../docs/development/setup.md) | `make start` |
| Understand or build the image | [Shared image](IMAGE.md) | `docker build -f deploy/docker/Dockerfile .` |
| Host it myself on Railway | [Railway self-host guide](RAILWAY.md) | `railway init` |
| Update, back up, restore or rotate credentials | [Operations](OPERATIONS.md) | `make railway-check-backups` |

`make help` lists every command, grouped the same way.

The project runs no public demo instance: every deployment is someone's own
private notebook. Try it locally with `make app`.

## Files

| File | Purpose |
| --- | --- |
| `docker/Dockerfile` | Native arm64/amd64 build; serves frontend and API |
| `local/docker-compose.yml` | PocketBase only: `make up` |
| `local/docker-compose-full.yml` | PocketBase, Mailpit and RustFS for development: `make up-full` |
| `local/docker-compose-stack.yml` | Self-contained stack, nothing mounted: `make app` |
| `railway/railway.json` | Railway build path, health check and restart policy |
| `railway/.env.example` | Template for the private operator file `railway/.env` |
| `railway/run.sh`, `railway/*.ts` | Operator scripts behind the `make railway-*` targets |

## Self-contained stacks

Run `make app` for a complete, seeded app that needs only Docker. Named stacks,
ports and data removal are covered in [Local stacks](LOCAL.md#self-contained-stacks).

## Backup health and credential rotation

Run `make railway-check-backups` to confirm scheduled backups are fresh. The
check, the restore drill and bucket credential rotation are in
[Operations](OPERATIONS.md#backups).

## Account lifecycle

Deploys never create accounts or reset passwords. First-time setup is in the
[Railway guide](RAILWAY.md#6-create-the-superuser); day-to-day account
handling is in [Operations](OPERATIONS.md#accounts).
