#!/bin/sh
set -eu

certificate=/development/cert.pem

[ -r "$certificate" ] || {
	echo "Missing readable development certificate: $certificate" >&2
	exit 1
}

openssl x509 -in "$certificate" -noout

# update-ca-certificates rebuilds the bundle, so repeated starts do not append duplicates.
cp "$certificate" /usr/local/share/ca-certificates/mailpit.crt
update-ca-certificates

# Start PocketBase
exec /pb/pocketbase --dev serve --http=0.0.0.0:8080 --encryptionEnv=PB_ENCRYPTION_KEY
