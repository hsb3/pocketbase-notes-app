#!/usr/bin/env python3
"""Score a flicker performance report or a directory of extracted sample JSON files."""

import argparse
import base64
import csv
import io
import json
import math
import re
import sys
import zipfile
from itertools import pairwise, product
from pathlib import Path

EXPECTED = set(product(("chromium", "webkit"), (0, 120), (1, 2, 3)))
OPERATIONS = ["typing", "switch", "move"]


def attachments(node, folder):
    if isinstance(node, list):
        for item in node:
            yield from attachments(item, folder)
    elif isinstance(node, dict):
        if node.get("name") == "flicker-samples":
            body = (
                (folder / node["path"]).read_bytes() if "path" in node else node["body"]
            )
            yield json.loads(body)
        else:
            for item in node.values():
                yield from attachments(item, folder)


def read_samples(folder):
    html = folder / "index.html"
    if not html.exists():
        for path in sorted(folder.glob("*.json")):
            yield json.loads(path.read_text())
        return

    match = re.search(
        rb"data:application/zip;base64,([A-Za-z0-9+/=]+)", html.read_bytes()
    )
    if not match:
        raise ValueError("Unrecognized Playwright HTML report")
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(match[1]))) as archive:
        for name in archive.namelist():
            if name.endswith(".json") and name != "report.json":
                yield from attachments(json.loads(archive.read(name)), folder)


def percentile(values, p):
    if values:
        return round(sorted(values)[math.ceil(len(values) * p) - 1], 2)


def score(run, delay):
    op = run["operation"]
    states, frames, entries = run["states"], run["frames"], run["entries"]
    if not states or not all(
        states[0][key] for key in ("workspace", "list", "sentinel", "editor", "status")
    ):
        raise ValueError(f"Missing starting surface for {op}")
    if len(frames) < 2:
        raise ValueError(f"Missing frame intervals for {op}")

    def transitions(field):
        return sum(a[field] != b[field] for a, b in pairwise(states))

    def fallback_ms(field):
        return round(sum(b["at"] - a["at"] for a, b in pairwise(states) if a[field]), 2)

    deltas = [b["at"] - a["at"] for a, b in pairwise(frames)]
    begin, end = 0, run["duration"]
    keys = run["keys"]
    if op == "typing" and delay:
        begin, end = run["marks"]["replyHeld"], run["marks"]["releaseReply"]
        keys = [k for k in keys if begin <= k["at"] <= end]
    if op == "typing" and len(keys) != (7 if delay else 8):
        raise ValueError(
            f"Incomplete key overlap for {delay} ms reads: {len(keys)} keys"
        )
    key_to_raf = [k["nextRaf"] - k["at"] for k in keys]
    keydowns = [
        e["duration"]
        for e in entries.get("event", [])
        if e["name"] == "keydown" and begin <= e["at"] <= end
    ]
    shifts = entries.get("layout-shift")
    return dict(
        operation=op,
        list_fallbacks=sum(
            bool(b["listFallback"]) and not a["listFallback"]
            for a, b in pairwise(states)
        ),
        list_fallback_total_ms=fallback_ms("listFallback"),
        list_fallback_frames=sum(bool(f["listFallback"]) for f in frames),
        document_fallback_total_ms=fallback_ms("documentFallback"),
        document_fallback_frames=sum(bool(f["documentFallback"]) for f in frames),
        list_transitions=transitions("list"),
        sentinel_transitions=transitions("sentinel"),
        editor_transitions=transitions("editor"),
        status_transitions=transitions("status"),
        workspace_transitions=transitions("workspace"),
        theme_transitions=transitions("theme"),
        frame_intervals=len(deltas),
        frame_median_ms=percentile(deltas, 0.5),
        frame_p95_ms=percentile(deltas, 0.95),
        frame_max_ms=percentile(deltas, 1),
        frame_gaps_over_25_ms=sum(d > 25 for d in deltas),
        key_count=len(keys),
        key_to_next_raf_p95_ms=percentile(key_to_raf, 0.95),
        event_keydowns=len(keydowns) if "event" in entries else None,
        event_keydown_max_ms=percentile(keydowns, 1),
        longtasks=len(entries["longtask"]) if "longtask" in entries else None,
        shifts=len(shifts) if shifts is not None else None,
        shift_sum=round(sum(e["value"] for e in shifts), 6)
        if shifts is not None
        else None,
        shift_without_input=round(
            sum(e["value"] for e in shifts if not e["recentInput"]), 6
        )
        if shifts is not None
        else None,
    )


def rows(folder):
    samples = {}
    for sample in read_samples(folder):
        key = sample["engine"], sample["delay"], sample["repetition"]
        if key in samples:
            raise ValueError(f"Duplicate sample {key}")
        samples[key] = sample["runs"]
    if samples.keys() != EXPECTED:
        raise ValueError(
            f"Incomplete matrix: missing {EXPECTED - samples.keys()}, extra {samples.keys() - EXPECTED}"
        )
    for (engine, delay, rep), runs in sorted(samples.items()):
        if [r["operation"] for r in runs] != OPERATIONS:
            raise ValueError(
                f"Missing or unexpected operation in {engine} {delay} {rep}"
            )
        for run in runs:
            yield dict(
                engine=engine, read_delay_ms=delay, repetition=rep, **score(run, delay)
            )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument(
        "--gate", action="store_true", help="exit 1 on a continuity failure"
    )
    args = parser.parse_args()
    try:
        results = list(rows(args.directory))
    except (OSError, ValueError, KeyError, TypeError, zipfile.BadZipFile) as error:
        parser.error(f"Invalid flicker report: {error}")

    writer = csv.DictWriter(sys.stdout, fieldnames=results[0])
    writer.writeheader()
    writer.writerows(results)
    if args.gate:
        losses = sum(
            row["operation"] in ("typing", "move")
            and any(
                row[k]
                for k in (
                    "list_transitions",
                    "sentinel_transitions",
                    "editor_transitions",
                    "list_fallbacks",
                )
            )
            for row in results
        )
        flashes = sum(
            row["operation"] == "switch" and row["document_fallback_frames"] > 0
            for row in results
        )
        if losses or flashes:
            print(
                f"RED: {losses} same-query save/move windows lost content",
                file=sys.stderr,
            )
            print(
                f"RED: {flashes} warm switch windows sampled a full-pane placeholder",
                file=sys.stderr,
            )
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
