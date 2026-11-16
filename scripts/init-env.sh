#!/bin/sh
# Create .env from .env.example when missing, then fill in secrets that are still
# empty. A value that is already set is never changed. Needs no Bun or Node.
set -eu

file=${1:-.env}

if [ ! -f "$file" ]; then
	cp .env.example "$file"
	chmod 600 "$file"
	echo "Created $file from .env.example" >&2
fi

random_hex() {
	if command -v openssl >/dev/null 2>&1; then
		openssl rand -hex "$1"
	else
		od -An -N"$1" -tx1 /dev/urandom | tr -d ' \n'
	fi
}

fill() {
	key=$1
	if grep -Eq "^$key=[^[:space:]]" "$file"; then
		return 0
	fi
	value=$(random_hex "$2")
	if grep -Eq "^$key=[[:space:]]*$" "$file"; then
		# Rewrite in place through cat so the file keeps its mode and owner.
		tmp=$(mktemp)
		awk -v key="$key" -v value="$value" \
			'$0 ~ "^" key "=[[:space:]]*$" && !done { print key "=" value; done = 1; next } { print }' \
			"$file" >"$tmp"
		cat "$tmp" >"$file"
		rm -f "$tmp"
	else
		printf '%s=%s\n' "$key" "$value" >>"$file"
	fi
	chmod 600 "$file"
	echo "Generated $key in $file" >&2
}

# PocketBase needs exactly 32 characters here.
fill PB_ENCRYPTION_KEY 16
fill PB_PASSWORD 12
