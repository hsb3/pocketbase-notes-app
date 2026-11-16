#!/bin/sh
# Local development only; existing passwords are preserved unless explicitly reset.
set -eu
exec bun run scripts/seed.ts "$@"
