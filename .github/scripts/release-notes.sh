#!/usr/bin/env bash
# Usage: release-notes.sh <tag>. Fails unless <tag> is v<package.json version> with a dated
# CHANGELOG.md section; prints that section as release notes. See docs/ci/releasing.md.
set -euo pipefail

tag=${1:?usage: release-notes.sh <tag>}
version=$(jq -r .version package.json)

if [ "$tag" != "v$version" ]; then
  echo "Tag $tag does not match package.json version $version (expected v$version)." >&2
  exit 1
fi

if ! grep -Eq "^## \[$version\] - [0-9]{4}-[0-9]{2}-[0-9]{2}$" CHANGELOG.md; then
  echo "CHANGELOG.md has no dated '## [$version] - YYYY-MM-DD' section." >&2
  exit 1
fi

notes=$(awk -v version="$version" '
  /^## \[/ { printing = index($0, "## [" version "]") == 1; next }
  /^\[[^]]+\]: / { next }
  printing { print }
' CHANGELOG.md | sed -E 's/\[#([0-9]+)\]/#\1/g')

if [ -z "$(printf '%s' "$notes" | tr -d '[:space:]')" ]; then
  echo "CHANGELOG.md section for $version is empty." >&2
  exit 1
fi

printf '%s\n' "$notes"
