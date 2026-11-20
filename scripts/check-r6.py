#!/usr/bin/env python3
"""Check R6 browser evidence."""
import base64
import hashlib
import json
import re
import sys
from pathlib import Path

ENGINES = ("chromium", "webkit")
WIDTHS = (390, 810, 1440)
THEMES = ("light", "dark")
STATES = ("folders", "list", "saved-editor", "search-result", "opened-result", "restored-results")
ROOT = "tests/e2e/"


def require(condition, message):
    if not condition:
        raise ValueError(str(message))


def key(file, title, engine):
    return ROOT + file + ".spec.cjs", (title,), engine


def inventory(path):
    report = json.loads(Path(path).read_text())
    require(report["errors"] == [], f"{path}: global errors {report['errors']}")
    cases = {}

    def visit(suite, titles):
        for spec in suite.get("specs", []):
            for test in spec["tests"]:
                k = ROOT + spec["file"], (*titles, spec["title"]), test["projectName"]
                require(k not in cases, f"Duplicate key {k}")
                cases[k] = test
        for child in suite.get("suites", []):
            visit(child, (*titles, child["title"]) if child["title"] else titles)

    for file_suite in report["suites"]:
        visit(file_suite, ())
    return cases


def attachment(result, name, label):
    matches = [a for a in result["attachments"] if a["name"] == name]
    require(len(matches) == 1 and matches[0]["contentType"] == "application/json", label)
    return json.loads(base64.b64decode(matches[0]["body"], validate=True))


def compose(result, engine):
    trials = {}
    for line in "".join(s.get("text", "") for s in result["stdout"]).splitlines():
        line = re.sub(r"\x1b\[[0-9;]*m", "", line)
        match = re.fullmatch(r"SC-001 (\w+) (\d+) (.+)", line)
        if not match:
            continue
        project, index, data = match.groups()
        index, data = int(index), json.loads(data)
        require(project == engine and index not in trials, line)
        passed = data["pass"]
        require(type(passed) is bool, line)
        if passed:
            require(490 <= data["dispatch"] <= 650 and 0 <= data["elapsed"] <= 1000
                    and len(data["inputs"]) == 1 and data["inputs"][0]["focused"] is True
                    and data["text"] == "x", line)
        trials[index] = passed
        print("SC-001", engine, 390, index, data["elapsed"], data["dispatch"], passed)
    hits = sum(trials.values())
    require(set(trials) == set(range(1, 21)) and hits >= 19, f"SC-001 {engine}: {hits}/{len(trials)}")
    print(f"SC-001 {engine}: {hits}/20")


def timings(cases, engine, width):
    sources = (
        ("healthy", "note-recovery-controls", "Healthy delayed acknowledgements preserve pending status"),
        ("failure", "save-resilience", "Failed save"),
        ("delayed response", "save-resilience", "Retry after further typing"),
    )
    for name, file, title in sources:
        label = f"SC-002 {name} {engine} {width}"
        result = cases[key(file, f"{title} at {width}px", engine)]["results"][0]
        data = attachment(result, "SC-002 " + name, label)
        fields = {"healthy": ("pauseMs", "delayMs"), "failure": ("pauseMs", "retryMs"),
                  "delayed response": ("delayMs",)}[name]
        for field in fields:
            value = data[field]
            require(type(value) in (float, int) and
                    (value >= 3000 if field == "delayMs" else 0 <= value <= 1000), f"{label} {field}={value}")
        if name != "failure":
            log = data["log"]
            inputs = [e["time"] for e in log if e["kind"] == "input"]
            replies = [e["time"] for e in log if e["kind"] == "reply"]
            require(len(inputs) >= 2 and replies and replies[-1] > inputs[-1], label)
            statuses = [e["value"].lower() for e in log if e["kind"] == "status"
                        and inputs[-1] <= e["time"] < replies[-1]]
            require("pending" in statuses and "saved" not in statuses, label)
        print(label, {f: data[f] for f in fields})


def journey_key(engine, width, theme):
    return key("m1-journey", f"Capture and find at {width}px in {theme}", engine)


def journey(cases, directory, engine, width, theme):
    result = cases[journey_key(engine, width, theme)]["results"][0]
    for state in STATES:
        cell = f"{engine}-{width}-{theme}-{state}"
        data = attachment(result, state, cell)
        require(data["route"].startswith("/") and 0 < data["scrollWidth"] <= data["clientWidth"] <= width
                and data["scrollX"] == 0, f"{cell}: {data}")
        require((directory / "journey" / (cell + ".png")).stat().st_size > 0, cell)
        print(cell, data)


def full(base, mode, directory):
    require(mode in ("baseline", "journey", "transition"), mode)
    raw = Path(base).read_bytes()
    require(hashlib.sha256(raw).hexdigest() ==
            "5abdf3b192ab5f91e8ad515f9de06c27c61ca4ac8548d7a9699075b93aca0721", "Wrong baseline")
    expected = {(f, tuple(t), e) for f, t, e in map(json.loads, raw.splitlines())}
    if mode != "baseline":
        expected.update(journey_key(e, w, t) for e in ENGINES for w in WIDTHS for t in THEMES)
    if mode == "transition":
        expected = {k for k in expected if k[0] != ROOT + "registration-enabled.spec.cjs"}
    directory = Path(directory)
    for filename in ("full.list.json", "full.json"):
        cases = inventory(directory / filename)
        require(cases.keys() == expected,
                f"{filename}: missing {sorted(expected - cases.keys())}; unexpected {sorted(cases.keys() - expected)}")
    for k, test in cases.items():
        skip = k[0] == ROOT + "registration-enabled.spec.cjs"
        status = "skipped" if skip else "passed"
        require(test["expectedStatus"] == status and test["status"] == ("skipped" if skip else "expected")
                and [(r["status"], r["retry"]) for r in test["results"]] == [(status, 0)], k)
    for e in ENGINES:
        compose(cases[key("compose-timing", "SC-001 warm Compose accepts one scheduled key per tap", e)]["results"][0], e)
        for w in WIDTHS:
            timings(cases, e, w)
            if mode != "baseline":
                for t in THEMES:
                    journey(cases, directory, e, w, t)
    skips = sum(t["status"] == "skipped" for t in cases.values())
    print(f"{len(cases)} keys, {len(cases)-skips} passed once, {skips} skipped")


def policy(mode, root):
    require(mode in ("inherited", "transition"), mode)
    root = Path(root)
    guards = {
        "registration-enabled": [('process.env.VITE_SIGNUP_ENABLED !== "true"', "Run the explicit signup-enabled check.")],
        "recently-deleted": [(p + 'process.env.CONTAINED_TEST !== "1"', "Ageing a note needs the contained stack")
                             for p in ("", 'kind === "restore" && ')],
    }
    if mode == "transition":
        del guards["registration-enabled"]
    for path in [*root.glob("tests/e2e/*.spec.cjs"), root / "tests/performance/editor.spec.cjs",
                 root / "playwright.config.ts", root / "playwright.performance.config.ts"]:
        source = path.read_text()
        for condition, reason in guards.get(path.name.split(".")[0], []):
            pattern = r'test\.skip\(\s*' + re.escape(condition) + r',\s*"' + re.escape(reason) + r'",\s*\);'
            source, count = re.subn(pattern, "", source)
            require(count == 1, f"{path}: expected one {condition}")
        for match in re.finditer(r'\btest(?:\s*\.\s*\w+)*\s*\.\s*(?:skip|fixme|only|fail(?:ing)?)\b'
                                 r'|\bretries\s*:[^,}\n]+', source):
            require(re.fullmatch(r'retries\s*:\s*0\s*', match[0]), f"{path}: {match[0]}")
    package = json.loads((root / "package.json").read_text())["scripts"]
    for name, command in [("test:e2e", "bun run test:api && playwright test"),
                          ("test:performance", "playwright test --config playwright.performance.config.ts")]:
        require(package[name] == command, f"package.json {name}: {package[name]}")
    runner = "scripts/run-contained.sh"
    lines = (root / runner).read_text().splitlines()
    commands = [line.strip().split('"${tests[@]}"')[-1].removesuffix(")").strip()
                for line in lines if re.search(r'\btests\+?=|\$\{tests\[@\]\}|playwright/cli\.js test', line)]
    reports = ["--list --reporter=json", "--reporter=list,html,json"]
    selection = reports + PROFILE_COMMANDS + SIGNUP_COMMANDS if mode == "inherited" else [
        "", *SIGNUP_COMMANDS, *reports, *PROFILE_COMMANDS,
    ]
    expected = ["tests=(env CONTAINED_TEST=1 node node_modules/playwright/cli.js test", *selection, "|| test_status=$?"]
    require(commands == expected, f"{runner}: {commands}")
    ci = ".github/workflows/ci.yml"
    jobs = re.split(r"^  ([\w-]+):[ \t]*$", (root / ci).read_text(), flags=re.M)
    commands = [line.strip() for name, body in zip(jobs[1::2], jobs[2::2])
                if name in ("e2e", "recover") for line in body.splitlines()
                if re.search(r'playwright test|bun run test:e2e', line)]
    if mode == "inherited":
        expected = ["run: bun run test:e2e",
                    "VITE_SIGNUP_ENABLED=true PLAYWRIGHT_HTML_OUTPUT_DIR=playwright-report/signup-enabled "
                    "bunx playwright test tests/e2e/registration-enabled.spec.cjs --output=test-results/signup-enabled"]
    else:
        expected = []
        for profile in ("plain", "signup"):
            output = "" if profile == "plain" else " --output=test-results/signup-enabled"
            expected.extend([f"PLAYWRIGHT_JSON_OUTPUT_FILE=ci-artifacts/{profile}/{profile}.list.json "
                             f"bunx playwright test --list --reporter=json{output}",
                             f"bunx playwright test --reporter=list,html,json{output}"])
    require(commands == expected, f"{ci}: {commands}")
    print(f"{mode} declarations and Playwright commands verified")


REPORT = " --workers=1 --retries=0 --reporter=list,html,json"
PROFILE_COMMANDS = [
    "tests/e2e/note-actions.spec.cjs tests/e2e/recently-deleted.spec.cjs" + REPORT,
    "tests/e2e/search.spec.cjs tests/e2e/search-timing.spec.cjs" + REPORT,
    "tests/e2e/save-resilience.spec.cjs --grep @sc003" + REPORT,
    "--config=playwright.performance.config.ts",
]
SIGNUP_COMMANDS = [
    "signup) tests+=(tests/e2e/registration-enabled.spec.cjs) ;;",
    "signup-disabled) tests+=(tests/e2e/registration.spec.cjs) ;;",
]


if __name__ == "__main__":
    try:
        command, *args = sys.argv[1:]
        if command == "inventory":
            for k in sorted(inventory(*args)):
                print(json.dumps(k, ensure_ascii=False, separators=(",", ":")))
        elif command == "full":
            full(*args)
        elif command == "policy":
            policy(*args)
        else:
            sys.exit("Expected inventory, full or policy")
    except (ValueError, OSError, KeyError, TypeError, IndexError, AttributeError) as error:
        sys.exit(str(error))
