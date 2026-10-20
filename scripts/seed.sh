#!/bin/sh
# Seed a PocketBase admin (superuser) and a verified regular user for local dev,
# then prove both can actually log in.
# Requires the PocketBase container ($PB_CONTAINER, default "pocketbase") to be running.
set -eu

PB_URL=${PB_URL:-http://localhost:${PB_PORT:-8090}}
ADMIN_EMAIL=${PB_EMAIL:-admin@example.com}
ADMIN_PASSWORD=${PB_PASSWORD:-admin-changeme-123}
USER_EMAIL=${SEED_USER_EMAIL:-user@example.com}
USER_PASSWORD=${SEED_USER_PASSWORD:-user-changeme-123}

json_field() { sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p"; }

# Superuser (PB 0.23+ replaced "admins" with the _superusers collection):
# upsert creates it or resets the password if it already exists.
docker exec "${PB_CONTAINER:-pocketbase}" /pb/pocketbase superuser upsert "$ADMIN_EMAIL" "$ADMIN_PASSWORD" \
	--encryptionEnv=PB_ENCRYPTION_KEY >/dev/null

token=$(curl -sf "$PB_URL/api/collections/_superusers/auth-with-password" \
	-H 'Content-Type: application/json' \
	-d "{\"identity\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
	| json_field token)

# Regular user: create verified; if it already exists, force verified + known password.
if ! curl -sf "$PB_URL/api/collections/users/records" \
	-H 'Content-Type: application/json' -H "Authorization: $token" \
	-d "{\"email\":\"$USER_EMAIL\",\"password\":\"$USER_PASSWORD\",\"passwordConfirm\":\"$USER_PASSWORD\",\"name\":\"Test User\",\"verified\":true}" \
	>/dev/null; then
	id=$(curl -sfG "$PB_URL/api/collections/users/records" \
		-H "Authorization: $token" \
		--data-urlencode "filter=(email='$USER_EMAIL')" | json_field id)
	[ -n "$id" ] || { echo "ERROR: could not create or find $USER_EMAIL" >&2; exit 1; }
	curl -sf -X PATCH "$PB_URL/api/collections/users/records/$id" \
		-H 'Content-Type: application/json' -H "Authorization: $token" \
		-d "{\"verified\":true,\"password\":\"$USER_PASSWORD\",\"passwordConfirm\":\"$USER_PASSWORD\"}" \
		>/dev/null
fi

# Prove both accounts can log in.
curl -sf "$PB_URL/api/collections/_superusers/auth-with-password" \
	-H 'Content-Type: application/json' \
	-d "{\"identity\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" >/dev/null \
	&& echo "admin login OK" \
	|| { echo "ERROR: admin login failed" >&2; exit 1; }

curl -sf "$PB_URL/api/collections/users/auth-with-password" \
	-H 'Content-Type: application/json' \
	-d "{\"identity\":\"$USER_EMAIL\",\"password\":\"$USER_PASSWORD\"}" >/dev/null \
	&& echo "user login OK" \
	|| { echo "ERROR: user login failed" >&2; exit 1; }

# Add sample entries only to an empty notebook.
bun run scripts/seed-entries.ts
