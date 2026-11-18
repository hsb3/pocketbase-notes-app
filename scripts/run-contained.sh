#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

case ${1:-} in api|browser) ;; *) echo "Usage: $0 api|browser" >&2; exit 2 ;; esac
# TERM at minute 29 leaves one minute for teardown before the absolute deadline.
if [[ ${2:-} != --timed ]]; then
  exec timeout --kill-after=60s 29m bash "$0" "$1" --timed </dev/null
fi

project="notes-test-$(openssl rand -hex 12)"
unset SEED_USER_EMAIL SEED_USER_PASSWORD COMPOSE_REMOVE_ORPHANS
export COMPOSE_PROJECT_NAME=$project
export PB_EMAIL=runner@example.test RUSTFS_ACCESS_KEY=pocketbase RUSTFS_BUCKET=pocketbase
export PB_PASSWORD PB_ENCRYPTION_KEY RUSTFS_SECRET_KEY TEST_BUN_IMAGE TEST_BROWSER_IMAGE
PB_PASSWORD=$(openssl rand -hex 24)
PB_ENCRYPTION_KEY=$(openssl rand -hex 16)
RUSTFS_SECRET_KEY=$(openssl rand -hex 20)
export VITE_SIGNUP_ENABLED=false
TEST_BUN_IMAGE=$(awk '/^FROM .* AS deps$/{print $2}' deploy/docker/Dockerfile)
TEST_BROWSER_IMAGE="mcr.microsoft.com/playwright:v$(sed -n 's/^ *"@playwright\/test": \["@playwright\/test@\([^"]*\)".*/\1/p' bun.lock)-noble"
compose=(docker compose --env-file /dev/null --project-directory . -p "$project"
  -f deploy/local/docker-compose-stack.yml -f deploy/local/docker-compose-test.yml)
label="label=com.docker.compose.project=$project"
cleanup() {
  local status=$? ids id remaining
  trap - EXIT
  # Docker lists newest first, so namespace users are removed before PocketBase.
  ids=$(docker ps -aq --filter "$label") || status=1
  for id in $ids; do
    docker rm -fv "$id" >/dev/null || status=1
  done
  "${compose[@]}" --profile setup down -v --remove-orphans --timeout 2 || status=1
  for kind in container network volume; do
    if [[ $kind = container ]]; then
      remaining=$(docker ps -aq --filter "$label") || status=1
    else
      remaining=$(docker "$kind" ls -q --filter "$label") || status=1
    fi
    echo "cleanup $project $kind: ${remaining:-empty}"
    [[ -z $remaining ]] || status=1
  done
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
echo "Contained $1 gate: $project"
start() {
  local service=$1 id
  shift
  id=$("${compose[@]}" run -dT --rm --no-deps --use-aliases --name "$project-$service" "$@" "$service")
  docker inspect "$id" | python3 -I -c '
import json, sys
item = json.load(sys.stdin)[0]
c = item["HostConfig"]
print(item["Name"], "cpu={NanoCpus} memory={Memory} pids={PidsLimit} "
      "autoRemove={AutoRemove} network={NetworkMode} ports={PortBindings}".format(**c), flush=True)
assert all(m["Type"] == "volume" for m in item["Mounts"]), "Unexpected mount"
assert 0 < c["NanoCpus"] <= 2_000_000_000 and 0 < c["Memory"] <= 4 * 1024**3
assert 0 < c["PidsLimit"] <= 512 and c["AutoRemove"]
assert not c["PortBindings"] and not c["PublishAllPorts"] and c["NetworkMode"] != "host"
'
}
idle() { start "$1" --entrypoint "sleep 1800"; }
inside() { local service=$1; shift; docker exec "$project-$service" "$@"; }
healthy() {
  local state log_pid i
  docker logs -f "$project-$1" >&2 &
  log_pid=$!
  for ((i=0; i<90; i++)); do
    state=$(docker inspect -f '{{.State.Health.Status}}' "$project-$1")
    case $state in healthy) kill "$log_pid" 2>/dev/null || true; return 0 ;; unhealthy) break ;; esac
    sleep 1
  done
  echo "$1 health check failed" >&2
  return 1
}

idle prepare
# Only test/build inputs are streamed. Local .env, databases and host modules stay outside.
COPYFILE_DISABLE=1 tar --exclude='._*' -cf - package.json bun.lock bunfig.toml index.html tsconfig*.json vite.config.ts src \
  pb/hooks pb/migrations scripts/*.ts deploy/docker/Dockerfile deploy/local/prepare-test.sh \
  tests/e2e playwright.config.ts | docker exec -i "$project-prepare" tar -xf -
inside prepare sh deploy/local/prepare-test.sh
docker stop -t 1 "$project-prepare" >/dev/null

start rustfs
[[ $(docker network inspect --format '{{.Internal}}' "${project}_default") = true ]] || {
  echo "Test network must be internal" >&2; exit 1
}
healthy rustfs
start pocketbase
healthy pocketbase
start mailpit
healthy mailpit
idle storage-init
# shellcheck disable=SC2016 # Credentials expand only inside the container.
inside storage-init sh -ec 'rc alias set local http://rustfs:9000 "$RUSTFS_ACCESS_KEY" "$RUSTFS_SECRET_KEY" >/dev/null && rc bucket create --ignore-existing "local/$RUSTFS_BUCKET"'
idle setup
inside setup bun run scripts/configure-services.ts
if [[ $1 = api ]]; then
  inside setup bun run test:api
else
  idle browser
  if ! inside browser node node_modules/playwright/cli.js test; then
    output="test-results/$project"
    mkdir -p "$output"
    docker cp "$project-browser:/app/playwright-report" "$output/"
    docker cp "$project-browser:/app/test-results" "$output/"
    echo "Browser failure artifacts: $output" >&2
    exit 1
  fi
fi
