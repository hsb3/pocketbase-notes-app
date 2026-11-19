# Self-host on Railway

Follow these steps top to bottom to run your own private instance: one Railway
service built from this repository, one volume for the data, real outgoing
email and scheduled off-volume backups. Public signup stays off; you create
the accounts.

Run every command from the repository root. Flags are from Railway CLI 5;
`railway <command> --help` is authoritative if yours differs.

## Before you start

- A [Railway](https://railway.com) account on a plan that allows outbound
  SMTP. Railway blocks SMTP below the Pro plan; see
  [outbound networking](https://docs.railway.com/networking/outbound-networking).
- The [Railway CLI](https://docs.railway.com/guides/cli). Docker is not needed:
  Railway builds the image.
- [Bun](https://bun.sh) and `bun install` in this checkout, for the operator
  scripts in steps 8 to 10.
- An SMTP provider with a verified sending domain. The defaults suit
  [Resend](https://resend.com/docs/send-with-smtp); any provider works.
- A password manager. You will store an encryption key, a superuser password
  and bucket credentials.

## 1. Create the project and service

```sh
railway login
railway init --name notes
railway add --service notes
railway status
```

`railway init` links this directory to the new project. Confirm that
`railway status` names the project, environment and service you expect before
every later step.

## 2. Set the service variables

```sh
openssl rand -hex 16 | railway variable set PB_ENCRYPTION_KEY --stdin --service notes --skip-deploys
railway variable set PORT=8080 --service notes --skip-deploys
railway variable set VITE_SIGNUP_ENABLED=false --service notes --skip-deploys
```

Copy `PB_ENCRYPTION_KEY` into your password manager now
(`railway variable list --service notes --kv` prints it). It must be exactly
32 characters and must never change: without it, a backup's encrypted settings
cannot be read.

## 3. Attach the data volume

```sh
railway volume add --service notes --mount-path /pb/pb_data
```

The volume holds the SQLite database and the attachment files. Run one
instance only: SQLite on a volume does not support replicas, and each deploy
restarts the service briefly.

## 4. Point Railway at the Dockerfile

Open the service in the dashboard (`railway open`), go to **Settings →
Config-as-code**, and set the config file path to
`deploy/railway/railway.json`. Keep the root directory at the repository root.
That file selects `deploy/docker/Dockerfile`, the `/api/health` check and the
restart policy.

If your account does not offer a config file path, set the same values
directly: add the variable `RAILWAY_DOCKERFILE_PATH=deploy/docker/Dockerfile`
and set the health check path to `/api/health` under **Settings → Deploy**.
Either way, the deployment details page shows the settings each deployment
actually used; check it after step 5.

## 5. Deploy and get a domain

For an existing entries-based deployment, follow the [pre-upgrade backup and rollback procedure](OPERATIONS.md#rollback) before deploying R2.

```sh
railway up --service notes --detach
railway service status
railway domain --service notes --port 8080
curl https://YOUR-DOMAIN/api/health
```

Wait for the deployment to report success before continuing. The domain's
target port must be `8080`, the image's fixed listener. Open
`https://YOUR-DOMAIN/folders/all`. After sign-in, refresh the page and reopen a note by its stable link.

## 6. Create the superuser

```sh
railway ssh --service notes -- /pb/pocketbase superuser create YOU@EXAMPLE.COM 'A-LONG-PASSWORD' --encryptionEnv=PB_ENCRYPTION_KEY
```

Use `create`, never `upsert`. PocketBase can exit zero after a CLI error, so
prove it worked: log in at `https://YOUR-DOMAIN/_/`. Do not run `make seed` or
any local seed script against a deployment; they refuse remote targets.

## 7. Create the backup bucket

```sh
railway bucket create notes-backups
railway bucket credentials --bucket notes-backups
```

The second command prints an endpoint, region, access key and secret. Any
private S3-compatible bucket outside the volume works equally well.

## 8. Fill in the operator file

```sh
cp deploy/railway/.env.example deploy/railway/.env
chmod 600 deploy/railway/.env
```

Set `PB_URL` to `https://YOUR-DOMAIN`, the superuser login from step 6, the
encryption key from step 2, your sender address and SMTP password, and the
bucket values from step 7. The file is ignored by Git and excluded from the
Docker build context.

## 9. Configure email, rate limits and backups

```sh
make railway-configure CONFIRM=YOUR-DOMAIN
```

`CONFIRM` must equal the hostname in `PB_URL`; every command that changes the
deployment requires it. This one sets the application URL, sender, SMTP,
application email links, rate limits and a daily backup to the bucket with
seven archives kept. It creates no accounts and changes no passwords.

Rate limits count requests per visitor address. Behind Railway's edge every
request arrives from the edge, so the command also tells PocketBase to read the
visitor's address from the `X-Real-IP` header, which Railway documents as the
client's address ([specs and limits](https://docs.railway.com/networking/public-networking/specs-and-limits)).
Without it, all visitors would share one budget of about two sign-ins every three
seconds. Check it once on your instance: see
[client addresses](OPERATIONS.md#client-addresses-and-rate-limits).

Then, in the Railway dashboard, enable daily and weekly backups on the volume
([volume backups](https://docs.railway.com/volumes/backups)).

## 10. Add users and verify

Create each person's account in the PocketBase dashboard, in the `users`
collection. Then prove the deployment works:

```sh
export DEPLOY_EVIDENCE_DIR="$HOME/notes-evidence/$(date +%Y%m%d-%H%M%S)"
make railway-verify-signup CONFIRM=YOUR-DOMAIN
make railway-verify-app CONFIRM=YOUR-DOMAIN
make railway-backup CONFIRM=YOUR-DOMAIN
```

These create temporary accounts and remove them afterwards; existing data is
left alone. The browser checks need `bunx playwright install chromium` once.
After the first scheduled backup, `make railway-check-backups` must pass.

Day-to-day work continues in [Operations](OPERATIONS.md).

## What this setup does not include

- Mailpit and RustFS are local development tools and are not deployed.
- OAuth providers are not configured.
- The checks in step 10 prove function, not capacity or recovery time. Run the
  [restore drill](OPERATIONS.md#restore-drill) before relying on backups.
