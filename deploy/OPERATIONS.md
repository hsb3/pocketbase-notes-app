# Operations

Runbook for a deployed instance. Commands run from the repository root on your
own machine and read their target from the private file `deploy/railway/.env`
(see the [Railway guide](RAILWAY.md#8-fill-in-the-operator-file)).

## Operator commands

| Command | Effect on the deployment |
| --- | --- |
| `make railway-check-backups` | None. Reads backup settings and listing metadata |
| `make railway-verify-restore` | None. Compares it with a local restore |
| `make railway-configure CONFIRM=<host>` | Writes SMTP, sender, email links, rate limits, backup schedule |
| `make railway-backup CONFIRM=<host>` | Creates one backup archive and downloads it |
| `make railway-verify-app CONFIRM=<host>` | Creates temporary users, a note and a file, then deletes them |
| `make railway-verify-signup CONFIRM=<host>` | Creates a temporary user to prove signup is refused |
| `make railway-verify-email CONFIRM=<host>` | Sends real email to `VERIFY_EMAIL` |

`<host>` is the hostname of `PB_URL`. A changing command stops before it
contacts anything unless `CONFIRM` matches. The scripts enforce the same rule
when run directly: set `DEPLOY_CONFIRM=<host>`.

Commands that save files need `DEPLOY_EVIDENCE_DIR`, an absolute directory.
Use a fresh one per run; it is created with private permissions. Output never
contains passwords or tokens; screenshots can show a temporary fixture email.
An interrupted run or a backend outage can prevent fixture cleanup, in which
case the command exits nonzero.

## Updates

1. Run `bun run lint`, `bun run build` and the relevant tests locally.
2. If the change includes a migration, take a backup first:
   `make railway-backup CONFIRM=<host>`.
3. Confirm the target with `railway status`, then deploy:
   `railway up --service <service> --detach`.
4. Wait for that deployment to report success (`railway service status`).
5. Check `/api/health`, refresh a deep link such as `/entries`, log in with an
   existing account, and open an attachment. A health check alone does not
   exercise email, storage or access rules.

Deploys start PocketBase against the existing volume. They create no accounts
and reset no passwords.

## Rollback

- **Code only, schema unchanged:** redeploy the last good deployment from the
  Railway dashboard.
- **Schema or data changed:** an older image does not undo a migration. Restore
  the pre-change backup into a separate instance first (see the restore drill),
  verify it, then plan the replacement of the live data.

## Backups

Two independent layers protect the data:

- **PocketBase scheduled backups** to a private S3-compatible bucket, set up
  by `make railway-configure`. They are portable: any machine with the matching
  image and encryption key can restore one. They include files stored on the
  volume but not objects in S3 attachment storage, which need their own backup.
- **Railway volume backups**, enabled in the dashboard. They restore only into
  the project and environment they came from.

App health says nothing about backups. Check them:

```sh
make railway-check-backups
```

The check fails when scheduled or off-volume backups are disabled, when storage
cannot be listed, or when the newest non-empty scheduled archive is older than
`BACKUP_MAX_AGE_HOURS` (default 26). Manual archives do not satisfy it. It
reads listing metadata only and does not download or validate an archive. Run
it from an external monitor with protected credentials and alert on a nonzero
exit; this repository does not provision that monitor.

### Restore drill

A backup is proven only by restoring it.

1. Pause writes to the deployment, then run
   `make railway-backup CONFIRM=<host>`. It saves `restore-proof.zip` in
   `DEPLOY_EVIDENCE_DIR`.
2. Extract the archive into an empty directory and start the same image on it
   locally, bound to loopback, with the same `PB_ENCRYPTION_KEY`.
3. In that copy, disable SMTP and the backup schedule before anything else.
4. Compare the copy with the deployment, read-only:
   `RESTORE_URL=http://127.0.0.1:<port> make railway-verify-restore`.
5. Remove the copy.

The comparison covers user, entry and attachment records and attachment bytes,
and fails if the deployment changed after the backup. It does not measure
recovery time for large data.

### Rotate the backup bucket credentials

1. Confirm the project, environment and bucket with `railway status` and
   `railway bucket info`. A reset invalidates the old credentials at once.
2. Reset them and save the new key and secret in `deploy/railway/.env`.
3. Enter them in PocketBase under **Settings → Backups → S3**. They take effect
   without a redeploy; editing the local file alone changes nothing.
4. Create a manual backup to prove access, and require
   `make railway-check-backups` to pass after the next scheduled run.

Never rotate `PB_ENCRYPTION_KEY` as part of this. Keep that key, and the
backups, in separate places.

## Accounts

- Create regular users in the PocketBase dashboard, in the `users` collection.
  Keep their passwords out of deployment files.
- Changing a password in an env file does not change the account. Use the
  app's reset flow or the PocketBase dashboard, then update your own record.
- Public signup is off unless `VITE_SIGNUP_ENABLED=true` is set as a service
  variable and the service is redeployed, so that the built frontend and the
  running backend agree.
- The account menu shows a **PocketBase admin** shortcut only to a signed-in
  user whose verified email matches a superuser. It opens the dashboard's own
  login and passes no credentials.

## Move or re-clone the checkout

Railway CLI linkage is stored per directory. Moving the checkout does not
affect the running service. In the new directory run `railway link`, then
confirm the project, environment and service with `railway status` before the
next deploy. Linking does not deploy.

## Rebuild from nothing

For a new empty instance, follow the [Railway guide](RAILWAY.md) again.
To recover existing data instead, reuse the original `PB_ENCRYPTION_KEY` in
step 2 of the guide and stop after step 6. Log in to the PocketBase dashboard
with that temporary superuser, upload the newest portable backup under
**Settings → Backups** and restore it. The restored data brings back its own
superusers, users and settings; log in with the original superuser and run
`make railway-check-backups`.
