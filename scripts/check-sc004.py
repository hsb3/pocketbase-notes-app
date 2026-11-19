#!/usr/bin/env python3
"""Validate individual SC-004 cells and the accompanying functional runs."""
import base64
import json
import math
import statistics
import sys
from pathlib import Path

CELLS = {(e, w) for e in ("chromium", "webkit") for w in (390, 810, 1440)}


def specs(suite):
    yield from suite.get("specs", [])
    for child in suite.get("suites", []):
        yield from specs(child)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def check(report):
    cells = set()
    functional = set()
    require(not report.get("errors"), "Playwright reported global errors")
    for spec in specs(report):
        timing = Path(spec["file"]).name == "search-timing.spec.cjs"
        require(timing or Path(spec["file"]).name == "search.spec.cjs", "Unexpected spec")
        require(timing == ("sc004" in spec["tags"]), "Wrong timing tag")
        for test in spec["tests"]:
            engine = test["projectName"]
            attempts = test["results"]
            require(test["expectedStatus"] == "passed" and test["status"] == "expected"
                    and len(attempts) == 1 and attempts[0]["status"] == "passed"
                    and attempts[0]["retry"] == 0, f"Did not pass once: {engine} {spec['title']}")
            if not timing:
                functional.add(engine)
                continue
            attachments = [a for a in attempts[0]["attachments"] if a["name"] == "sc004-samples"]
            require(len(attachments) == 1 and attachments[0]["contentType"] == "application/json",
                    "Expected one inline samples attachment")
            data = json.loads(base64.b64decode(attachments[0]["body"], validate=True))
            cell = engine, data["width"]
            require(cell in CELLS and cell not in cells and engine == data["engine"]
                    and spec["title"] == f"100 notes at {cell[1]}px", f"Unexpected or duplicate cell: {cell}")
            cells.add(cell)
            require(data["counts"] == [20] * 5, f"Wrong folder counts: {cell}")
            samples = data["samples"]
            require(len(samples) == 20 and {s["trial"] for s in samples} == set(range(1, 21)),
                    f"Missing or duplicate trial: {cell}")
            require(len({s["expectedId"] for s in samples}) == len({s["term"] for s in samples}) == 20,
                    f"Duplicate target: {cell}")
            for s in samples:
                require(s["correct"] is True and s["actualId"] == s["expectedId"] and s["actualId"]
                        and s["mark"] == s["term"] and s["term"], f"Incorrect target: {cell} {s['trial']}")
            times = [s["elapsed"] for s in samples]
            require(all(type(t) in (int, float) and math.isfinite(t) and t >= 0 for t in times),
                    f"Invalid duration: {cell}")
            fast = sum(t < 2000 for t in times)
            print(f"{engine} {cell[1]}px {times} ms; {fast}/20 under 2000; "
                  f"min/median/max {min(times):.1f}/{statistics.median(times):.1f}/{max(times):.1f}")
            require(fast >= 19, f"Too few trials under 2000 ms: {cell}")
    require(functional == {"chromium", "webkit"}, "Missing functional suite")
    require(cells == CELLS, f"Missing timing cells: {CELLS - cells}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: check-sc004.py <playwright-report.json>")
    try:
        check(json.loads(Path(sys.argv[1]).read_text()))
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
        sys.exit(str(error))
