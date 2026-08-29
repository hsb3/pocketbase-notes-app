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

Use [`deploy/local/docker-compose-full.yml`](../deploy/local/docker-compose-full.yml)
(`make up-full`) when you need to test email or file-upload flows locally.

**1. Generate a self-signed certificate.** PocketBase requires SMTP to be
secured (Always or StartTLS), so Mailpit needs a cert and the PocketBase
container needs to trust it (see [`scripts/start.sh`](../scripts/start.sh)):

```sh
openssl req -x509 -newkey rsa:4096 -nodes -keyout ./scripts/key.pem -out ./scripts/cert.pem \
  -sha256 -days 3650 -subj "/CN=." -addext "subjectAltName = DNS:mailpit"
```

The dev runner validates `scripts/cert.pem` as a readable PEM and fails before
PocketBase starts if it's missing or invalid.

**2. Configure SMTP and S3 in the PocketBase admin UI** after `make up-full`:

- PocketBase: http://localhost:8080/_/
- MinIO Console: http://localhost:9001 (create a bucket + access key first)
- Mailpit: http://localhost:8025

```
SMTP server host: mailpit
Port: 1025
Username: mailpit
Password: mailpit

S3 Endpoint: http://minio:9000
Bucket: <bucket name>
Access Key: <access key>
Secret: <secret>
Force path style addressing: True
```

Send a test email / upload a file from the admin UI to confirm both work.
