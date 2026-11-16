#!/bin/sh
# Run one operator script against the deployment named in deploy/railway/.env.
# Usage: deploy/railway/run.sh read|write <script.ts> [confirmed-hostname]
#   read   the script only reads; the target hostname is confirmed automatically.
#   write  the script changes the deployment or sends mail; the caller must pass
#          the exact hostname of PB_URL (make ... CONFIRM=<hostname>).
set -eu

mode=$1
script=$2
confirm=${3:-}
file=${RAILWAY_ENV:-deploy/railway/.env}

[ -f "$file" ] || {
	echo "Missing $file. Copy deploy/railway/.env.example and fill it in." >&2
	exit 1
}
command -v bun >/dev/null 2>&1 || {
	echo "Railway operator scripts need Bun on this machine (https://bun.sh)." >&2
	exit 1
}

# Read the target from the file itself so an inherited PB_URL cannot redirect the run.
url=$(sed -n 's/^PB_URL=//p' "$file" | tail -n 1 | tr -d "\"'[:space:]")
case $url in
https://?*) ;;
*)
	echo "PB_URL in $file must be the deployment's https:// address." >&2
	exit 1
	;;
esac
host=${url#https://}
host=${host%%[:/]*}

if [ "$mode" = write ]; then
	[ "$confirm" = "$host" ] || {
		echo "This target CHANGES $host (settings, records or real email)." >&2
		echo "Re-run with CONFIRM=$host to proceed." >&2
		exit 1
	}
else
	echo "Read-only check against $host" >&2
fi

# A local MAILPIT_URL from the root .env must not leak into a remote run.
exec env -u MAILPIT_URL PB_URL="$url" DEPLOY_CONFIRM="$host" DEPLOY_ALLOW_LOCAL=false \
	bun --env-file="$file" run "$script"
