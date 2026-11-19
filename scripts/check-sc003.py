#!/usr/bin/env python3
"""Check one complete SC-003 Playwright JSON report."""

import json
import sys
from collections import Counter
from pathlib import Path

SCENARIOS = [
    "Failed save",
    "Lost acknowledgement",
    "Retry after further typing",
    "Expiry during editing",
    "Two devices, one revision",
]
EXPECTED = {
    (f"{scenario} at {width}px", project)
    for scenario in SCENARIOS
    for width in (390, 810, 1440)
    for project in ("chromium", "webkit")
}


def specs(suite):
    yield from suite.get("specs", [])
    for child in suite.get("suites", []):
        yield from specs(child)


def check(report):
    seen = Counter()
    errors = []
    for spec in specs(report):
        for test in spec["tests"]:
            cell = spec["title"], test["projectName"]
            seen[cell] += 1
            attempts = test["results"]
            if (
                "sc003" not in spec["tags"]
                or Path(spec["file"]).name != "save-resilience.spec.cjs"
                or test["expectedStatus"] != "passed"
                or test["status"] != "expected"
                or len(attempts) != 1
                or attempts[0]["status"] != "passed"
                or attempts[0]["retry"] != 0
            ):
                errors.append(f"Did not pass once: {cell}")
    errors.extend(f"Missing: {cell}" for cell in sorted(EXPECTED - seen.keys()))
    errors.extend(f"Unexpected: {cell}" for cell in sorted(seen.keys() - EXPECTED))
    errors.extend(f"Duplicate: {cell}" for cell, count in seen.items() if count != 1)
    if report.get("errors"):
        errors.append("Playwright reported global errors")
    return errors


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: check-sc003.py <playwright-report.json>")
    try:
        failures = check(json.loads(Path(sys.argv[1]).read_text()))
    except (OSError, ValueError, TypeError, KeyError, AttributeError) as error:
        sys.exit(f"Invalid SC-003 report: {error}")
    if failures:
        sys.exit("\n".join(failures))
    print(f"SC-003: {len(EXPECTED)} cells passed once")
