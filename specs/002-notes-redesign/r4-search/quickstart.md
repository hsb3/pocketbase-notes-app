# R4 validation guide

These are implementation gates. Run live services only through the project’s contained runner, on its disposable account and project volumes. Record the baseline and candidate commits, exact command, exit status and runner artifact paths. Require an empty container/network/volume cleanup report for each run. Every new regression assertion must first fail against the pre-feature behavior for the expected reason. Existing controls may already pass. Missing credentials, failed setup, skipped tests or an empty test selection supply no product evidence.

## Records API

Extend the existing real-client cases in `scripts/test-notes.ts`. Use real users A and B, an unauthed client, the fixture helpers and one additional owned folder. Use the exact marked request from the [contract](contracts/search.md). Inspect status, counts, IDs and the entire projected row shape, not just the HTTP code.

| Probe | Passing evidence |
|---|---|
| Positive and negative owners | One active A note in Garden with a unique late body-only term, one separate B term. A gets exactly A’s ID and matching span. B and anonymous each get HTTP 200, zero items and totals for A’s term. Reverse A/B for B’s term. Unique names, writing and snippets never appear in the denied responses. |
| Unicode and literal operands | Compare the raw bound `(title ~ {:q} || text ~ {:q})` plus active filter to the marked search with an ASCII control and an accented and a Cyrillic uppercase term against lowercase originals. Raw misses the latter two on the pinned default. Marked finds them. Also cover decomposed café, original Straße for STRASSE, emoji preceding a match, fallback “Untitled note”, styled runs and mention labels. Unaccented cafe misses café. Independently require the exact original marked characters even when folded length differs. |
| Visible source only | Keep “paragraph” solely in document structure, a URL solely in a mark, and a unique word solely in an attachment’s bytes/name. Verify zero hits; a separate note actually containing “paragraph” is the positive control. A note matching in the title and twice in its body appears once. A match beyond an ordinary 120-character excerpt and near the end of a near-limit valid document must appear in the bounded response. |
| Punctuation and projection | Search literal percent, underscore, backslash and quotes, including combinations and punctuation with surrounding words. Include similar records without the literal characters as negatives. Assert exactly the allowed row and snippet keys, per-part limits, original text around the hit, no HTML interpolation, and absence of a deliberately distant sentinel from the JSON response. Ordinary excerpt/detail and hidden private virtual-field tests still pass. Malformed marked requests (missing active condition, over-limit term or page size, wrong fields/expand) return 400. |
| Deleted and paged results | In `CONTAINED_TEST=1`, arrange a deleted A note via the existing disposable admin SQL fixture pattern. Verify one affected row and nonempty deletion date via admin before the search. A/B/anonymous each get HTTP 200 and zero for its unique term. Seed 21+ active matches across folders, with tied update times in the contained fixture, assert exact totals, disjoint 20/remaining pages and the expected descending IDs on ties. |
| Migration | In the contained staged-upgrade database, compare the actual pre-R4 row before and after up/down/up. Assert index metadata including key order/direction via SQLite pragmas, preservation of rules and all original values. Run EXPLAIN QUERY PLAN on an owner + empty deleted + contains-LIKE query with production ordering, recording the named index and absence of a temporary sort for the representative query. This is a planner check; browser timing is separate. Verify fresh schema with contained codegen twice and the default API gate. |

## Browser behavior

Use the ordinary login, `ownerData`, `doc`, `seedNote` and owner detail reads from the existing test fixtures. In both Chromium and WebKit exercise 390×844, 810×1080 and 1440×1000 CSS pixels. Search from All Notes and from a custom folder different from the target note’s folder.

- Drive Search, paging, Clear and result opening with a keyboard. Check title, actual folder, visible nonempty mark, single matching link and plain-text handling. Test a direct search URL/reload, punctuation/numeric input, a late body-only hit, empty query, zero-hit message and return to the original nonfirst ordinary page.
- Create enough matches to open a row on search page 2 after scrolling. Test editor Back and browser Back independently. Assert restored path, q, both pages, exact result IDs, scroll offset and focused row. Open another result from the wide detail side list and verify Back. Check the bare note URL’s fallback. Refresh after save so a removed match disappears and focus has a valid destination.
- At wide width open one result and edit it, then select a different result. Hold a real PATCH in flight, release it and verify the owner’s new revision before the selection changes. Force a failed flush using R3’s request interception, exercise Keep editing, Discard and Save and continue with a successful real retry on separate attempts. Check URL, editor contents, focus and stored revisions at each boundary. At 390, exercise the guarded Back path from a dirty result before selecting another one.
- Switch the query before a delayed prior response resolves and sign out/switch owners with a response pending. Release the genuine earlier response last. Verify stale rows never replace the latest results or disclose A’s title/folder/snippet to B. Force a failed list read, show error + Retry, then recover against the real backend. Distinguish these states from a completed empty list.
- In light and dark, verify 390 places the input below the scrollport and clear of Compose, and 810/1440 place it above. Compare bounding boxes, focus visibility, result mark contrast (text/background at least 4.5:1) and document scrollWidth against clientWidth. Capture the filled and empty states with controls visible. For the search profile, write one PNG per engine × width × theme × state under the browser container’s /tmp/r4-search-views, using all four dimensions in each filename. Copy the directory beside the JSON report before teardown and review all 24 captures. R6 owns physical keyboard, real-device and cross-device sign-off.

## SC-004 timing

One tagged test per width per Playwright project, one worker, zero retries. For each cell create a fresh A, its default folder and four custom folders. Write exactly 20 active notes in each using ordinary owner requests. Embed one distinct opaque term in the body of each of 20 preselected notes (four per folder), never in titles or folder names. Keep an independent manifest of expected ID, title, folder name, original match and adjacent context for each trial. Use common synthetic context for the other 80 notes and place each target past the first 120 body characters. Confirm folder count, active counts per folder, total 100 and all 20 distinct targets from independent owner reads before timing. Open an ordinary folder list and wait for its initial render.

1. For each of the 20 predetermined terms, start with the previous result cleared and the list ready. Install a page-side clock before input. Take `performance.now()` at the input event that supplies the complete term. Submit immediately with Enter through the real form. Include submit, navigation, the actual HTTP request, rendering and one animation-frame paint opportunity in elapsed time. Use the same browser clock at both ends (observe the matching row, then two requestAnimationFrame callbacks and confirm it is still visible). Do not prefetch or reuse cached results. Keep the other 19 samples when one is slow.
2. Finish only when exactly one visible result links to the expected ID and shows the expected title, folder, original marked term and adjacent context. Require a successful new records-list response for that query, the bounded projection, and zero unexpected detail reads. A wrong/missing result fails correctness even if 19 timings pass. A correct result at or beyond 2000 ms is a timing miss. Use the existing bounded test timeout and emit partial diagnostic evidence on failure.
3. Attach one JSON payload per cell to the Playwright result as inline bytes with attachment name `sc004-samples`, MIME `application/json`. Include engine, width, counts per folder, and 20 numbered samples with expected/actual synthetic IDs, term/mark, correctness and elapsed milliseconds. The contained runner copies the JSON reporter file to `test-results/<project>/sc004.json` on pass or failure and runs the stdlib checker. The profile runs both search specs; check all functional cases for pass/zero retries, and count timing cells only from the timing spec tagged `@sc004`. Require exactly the six expected engine/width pairs, one attempt per cell, all samples correct and finite/nonnegative, and **at least 19 strictly below 2000 ms per cell**. Reject duplicates, skips, absent samples, retry results and pooled scores. Print each cell’s 20 numbers, count under threshold, min/median/max. Retain the raw report with the measured summary.

## Commands and release evidence

Run these from the repository root. The contained codegen command uses the pinned, seeded PocketBase to generate twice and compare before copying the output. An index-only migration should leave the tracked generated types byte-identical.

```sh
bash scripts/run-contained.sh codegen
make test-api-contained
CONTAINED_PROFILE=search bash scripts/run-contained.sh browser
make test-browser-contained
bun test tests/unit
bun run lint
bun run knip
bun run build
python3 scripts/ai-context.py check
bun run docs:build
```

The search profile runs the functional matrix, retains its screenshots and measures SC-004. The default browser gate covers the full UI and R3 regressions. Retain actual cell numbers, functional captures, and cleanup/exit evidence; summarize them in the verification doc and completed tasks. Physical-device status remains a separate R6 item. Planning supplies no browser performance measurements.
