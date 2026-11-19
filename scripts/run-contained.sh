#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

case ${1:-} in api|browser|codegen) ;; *) echo "Usage: $0 api|browser|codegen" >&2; exit 2 ;; esac
# TERM at minute 29 leaves one minute for teardown before the absolute deadline.
if [[ ${2:-} != --timed ]]; then
  exec timeout --kill-after=60s 29m bash "$0" "$1" --timed </dev/null
fi

profile=${CONTAINED_PROFILE:-default}
case "$1/$profile" in
  api/default|api/accounts|api/restore|api/load|browser/recover|browser/search|browser/screenshots|browser/performance|browser/resilience|browser/default|browser/operator|browser/signup|browser/signup-disabled|codegen/default) ;;
  *) echo "Unsupported contained profile: $1/$profile" >&2; exit 2 ;;
esac

project="notes-test-$(openssl rand -hex 12)"
unset COMPOSE_REMOVE_ORPHANS
export SEED_USER_EMAIL=seed@example.test SEED_USER_PASSWORD
SEED_USER_PASSWORD=$(openssl rand -hex 24)
export COMPOSE_PROJECT_NAME=$project
export PB_EMAIL=runner@example.test RUSTFS_ACCESS_KEY=pocketbase RUSTFS_BUCKET=pocketbase
export PB_PASSWORD PB_ENCRYPTION_KEY RUSTFS_SECRET_KEY TEST_BUN_IMAGE TEST_BROWSER_IMAGE
PB_PASSWORD=$(openssl rand -hex 24)
PB_ENCRYPTION_KEY=$(openssl rand -hex 16)
RUSTFS_SECRET_KEY=$(openssl rand -hex 20)
export VITE_SIGNUP_ENABLED=false
if [[ $profile = signup ]]; then export VITE_SIGNUP_ENABLED=true; fi
TEST_BUN_IMAGE=$(awk '/^FROM .* AS deps$/{print $2}' deploy/docker/Dockerfile)
TEST_BROWSER_IMAGE="mcr.microsoft.com/playwright:v$(sed -n 's/^ *"@playwright\/test": \["@playwright\/test@\([^"]*\)".*/\1/p' bun.lock)-noble"
export TEST_K6_IMAGE
TEST_K6_IMAGE=$(awk '/image: grafana\/k6:/ {print $2}' tests/load/compose.load.yml)
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
echo "Contained $1/$profile gate: $project"
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
inputs=(scripts/seed.sh)
case "$1/$profile" in
  api/default) inputs+=(deploy/railway/verification.ts) ;;
  api/load) inputs+=(tests/load/k6/script.js) ;;
  browser/screenshots) inputs+=(tests/screenshots/capture.cjs) ;;
  browser/performance) inputs+=(tests/performance playwright.performance.config.ts) ;;
  api/restore) inputs+=(deploy/railway/{evidence,verification,verify-restore}.ts) ;;
  browser/operator) inputs+=(deploy/railway/{configure,evidence,verification,verify-app,verify-email,verify-signup}.ts) ;;
esac
COPYFILE_DISABLE=1 tar --exclude='._*' -cf - package.json bun.lock bunfig.toml index.html tsconfig*.json vite.config.ts src \
  pb/hooks pb/migrations scripts/*.ts deploy/docker/Dockerfile deploy/local/prepare-test.sh \
  tests/e2e playwright.config.ts "${inputs[@]}" | docker exec -i "$project-prepare" tar -xf -
inside prepare sh deploy/local/prepare-test.sh "$profile"
if [[ $1/$profile = api/default || $1/$profile = browser/default || $1/$profile = browser/recover ]]; then
  docker exec -i "$project-prepare" sh -c 'cat > /pb/pb_hooks/zz-manual-cron.pb.js' <<'JS'
$app.onServe().bindFunc((e) => {
  const cron = e.app.cron();
  const jobs = cron.jobs().filter(j => j.id() === "expired-notes");
  if (jobs.length !== 1 || jobs[0].expression() !== "17 3 * * *") throw Error("Missing production purge schedule");
  console.log("Verified production cron", jobs[0].id(), jobs[0].expression());
  cron.add("expired-notes", "0 0 30 2 *", jobs[0].run);
  e.next();
});
JS
fi
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
if [[ $profile = accounts ]]; then
  # PID 1 owns this loopback listener and its private database in the helper.
  origin=http://127.0.0.1:18082
  start setup -e PB_URL="$origin" -e VITE_PB_URL="$origin" -e PB_ENCRYPTION_KEY -e CONTAINED_SEED_CLI=1 \
    --entrypoint "/pb/pocketbase serve --http=127.0.0.1:18082 --dir=/tmp/seed-data --hooksDir=/pb/pb_hooks --migrationsDir=/pb/pb_migrations --encryptionEnv=PB_ENCRYPTION_KEY"
  inside setup sh -ec 'i=0; until wget -qO /dev/null "$PB_URL/api/health"; do i=$((i+1)); [ "$i" -lt 30 ]; sleep 1; done'
  inside setup sh scripts/seed.sh
  inside setup bun scripts/test-seed.ts
  exit 0
fi
idle setup
inside setup bun run scripts/configure-services.ts
if [[ $1/$profile = api/default || $1/$profile = browser/default || $1/$profile = browser/recover ]]; then
  inside setup bun scripts/test-attachments.ts --cron-ready
fi
if [[ $profile = load ]]; then
  idle k6
  inside k6 mkdir /tmp/results
  inside k6 k6 run /app/tests/load/k6/script.js
  exit 0
fi
if [[ $profile = restore ]]; then
  docker exec -e PB_ENCRYPTION_KEY "$project-setup" bun scripts/test-restore.ts
  exit 0
fi
if [[ $1 != browser ]]; then
  types=src/services/pocketbase-types.ts
  inside setup bun scripts/test-notes.ts --seed-codegen
  inside setup rm -f "$types"
  inside setup bun --bun run pb:codegen
  inside setup mv "$types" /tmp/first-types.ts
  inside setup bun --bun run pb:codegen
  inside setup cmp /tmp/first-types.ts "$types"
  inside setup sha256sum "$types"
  if [[ $1 = codegen ]]; then
    docker cp "$project-setup:/app/$types" "$types"
    exit 0
  fi
  inside setup cat "$types" | cmp - "$types" || {
    echo "Regenerate PocketBase types with scripts/run-contained.sh codegen" >&2
    exit 1
  }
  inside setup bun test scripts/local-target.test.ts
  docker exec -i -e CONTAINED_TEST=1 "$project-pocketbase" sh -s < scripts/test-r2-upgrade.sh
  inside setup bun run test:api
else
  idle browser
  output="test-results/$project"
  if [[ $profile = screenshots ]]; then
    inside setup sh scripts/seed.sh
    docker exec -e SEED_USER_EMAIL -e SEED_USER_PASSWORD -e APP_URL=http://127.0.0.1:8080 \
      -e OUT_DIR=/tmp/screenshots "$project-browser" timeout 600 node tests/screenshots/capture.cjs
    mkdir -p "$output"
    docker cp "$project-browser:/tmp/screenshots" "$output/"
    scripts/capture-screenshots.sh --render "$output/screenshots"
    echo "Screenshot artifacts: $output/screenshots"
    exit 0
  fi
  if [[ $profile = operator ]]; then
    # Keep the operator mail verifier's loopback guard while Mailpit has its own service.
    docker exec -e RUSTFS_ACCESS_KEY -e RUSTFS_SECRET_KEY -e RUSTFS_BUCKET \
      "$project-browser" /app/operator-bun -e '
      const mail = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
        const url = new URL(request.url);
        url.host = "mailpit:8025";
        return fetch(url, { headers: { "accept-encoding": "identity" } });
      }});
      process.env.MAILPIT_URL = mail.url.origin;
      try {
        if (!(await fetch(new URL("/api/v1/messages", mail.url))).ok) throw Error("Mailpit proxy failed");
        await import("./scripts/test-deployment-accounts.ts");
      } finally { mail.stop(true); }
    '
    exit 0
  fi
  tests=(env CONTAINED_TEST=1 node node_modules/playwright/cli.js test)
  case $profile in
    recover)
      inside browser mkdir -p /tmp/r5-views
      tests=(env PLAYWRIGHT_JSON_OUTPUT_FILE=/tmp/recover.json "${tests[@]}" tests/e2e/note-actions.spec.cjs tests/e2e/recently-deleted.spec.cjs --workers=1 --retries=0 --reporter=list,html,json)
      ;;
    search)
      inside browser mkdir -p /tmp/r4-search-views
      tests=(env PLAYWRIGHT_JSON_OUTPUT_FILE=/tmp/sc004.json "${tests[@]}" tests/e2e/search.spec.cjs tests/e2e/search-timing.spec.cjs --workers=1 --retries=0 --reporter=list,html,json)
      ;;
    resilience)
      tests=(env PLAYWRIGHT_JSON_OUTPUT_FILE=/tmp/sc003.json "${tests[@]}" tests/e2e/save-resilience.spec.cjs --grep @sc003 --workers=1 --retries=0 --reporter=list,html,json)
      ;;
    performance)
      tests=(env PERF_SMOKE=1 "PERF_COMMIT=$(git rev-parse HEAD)" "PERF_WORKTREE=$(git status --short)" "${tests[@]}" --config=playwright.performance.config.ts)
      ;;
    signup) tests+=(tests/e2e/registration-enabled.spec.cjs) ;;
    signup-disabled) tests+=(tests/e2e/registration.spec.cjs) ;;
  esac
  test_status=0
  inside browser "${tests[@]}" || test_status=$?
  if [[ $profile = search || $profile = recover ]]; then
    if [[ $profile = search ]]; then
      report=sc004.json views=r4-search-views states=(filled empty)
    else
      report=recover.json views=r5-views states=(move-sheet delete-note folder-confirm trash-filled trash-empty)
    fi
    mkdir -p "$output"
    docker cp "$project-browser:/tmp/$report" "$output/$report" || test_status=1
    docker cp "$project-browser:/tmp/$views" "$output/" || test_status=1
    if (( test_status == 0 )); then
      if [[ $profile = search ]]; then
        python3 scripts/check-sc004.py "$output/$report" || test_status=1
      else
        python3 - "$output/$report" <<'PYREC' || test_status=1
import json, sys
def cases(suite):
    for spec in suite.get("specs", []):
        for test in spec["tests"]:
            yield test
    for child in suite.get("suites", []):
        yield from cases(child)
suites = json.load(open(sys.argv[1]))["suites"]
expected = {"note-actions.spec.cjs", "recently-deleted.spec.cjs"}
assert {s["file"].split("/")[-1] for s in suites if list(cases(s))} == expected, "Missing R5 suite"
tests = list(cases({"suites": suites}))
assert tests and all(t["status"] == "expected" and [r["status"] for r in t["results"]] == ["passed"] for t in tests), "Incomplete R5 browser cases"
PYREC
      fi
      for engine in chromium webkit; do
        for width in 390 810 1440; do
          for theme in light dark; do
            for state in "${states[@]}"; do
              file="$output/$views/$engine-$width-$theme-$state.png"
              [[ -s $file ]] || { echo "Missing screenshot: $file" >&2; test_status=1; }
            done
          done
        done
      done
    fi
    echo "Browser report: $output/$report"
  fi
  if [[ $profile = resilience ]]; then
    mkdir -p "$output"
    docker cp "$project-browser:/tmp/sc003.json" "$output/sc003.json" &&
      scripts/check-sc003.py "$output/sc003.json" || test_status=1
    echo "SC-003 report: $output/sc003.json"
  fi
  if (( test_status != 0 )); then
    mkdir -p "$output"
    docker cp "$project-browser:/app/playwright-report" "$output/"
    docker cp "$project-browser:/app/test-results" "$output/"
    echo "Browser failure artifacts: $output" >&2
    exit 1
  fi
  if [[ $profile = performance ]]; then
    mkdir -p "$output"
    docker cp "$project-browser:/app/playwright-report/performance" "$output/"
    echo "Performance smoke report: $output/performance"
  fi
fi
