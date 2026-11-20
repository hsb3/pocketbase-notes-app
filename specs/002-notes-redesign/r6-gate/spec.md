# R6 · Milestone 1 stabilization

Prove that one writer can capture, find, file and recover private writing on phone and desktop using the R1–R5 app. R6 ships proof, corrections to confirmed major product defects and unstable gate checks, current guides and captures. The parent specification remains the product contract. [Milestone gate, issue 41](https://github.com/hsb3/pocketbase-notes-app/issues/41) · [Stories, edge cases and success criteria](../spec.md) · [M1 scope and gate](../versions.md#3-milestone-1-stabilization-gate-r6)

| Gate | Acceptance |
|---|---|
| G1 Bug bar | Zero unresolved data loss, privacy, duplicate-note or broken capture/find defects. Enumerate every other known defect and obtain individual owner acceptance in the PR. No retries to pass. Put any requested features in the issue backlog. |
| G2 Repeatability | Three consecutive full local API + Chromium/WebKit runs at the same candidate, hosted CI green on deployment Linux amd64, all applicable tests accounted for. Resolve environment-specific skips with the owner. |
| G3 Coverage | Map all six Story 1 scenarios, Story 2.1, Story 3.1–3 content/folder parts, Stories 7.2–3 and all five spec edges to named checks or explicit gaps. Include the table in the PR. |
| G4 Privacy | A/B/guest controls on the notes, folders, action and file APIs. Check status, representation and independent persisted state. |
| G5 SC-003 | Ten consecutive complete recovery matrices, zero lost drafts, overwritten newer versions or duplicates. |
| G6 SC-001/002/004 | Record Compose, save and body-search timings with denominators and thresholds from the parent. |
| G7 Widths | Complete capture/find at 390, 810 and 1440 CSS px with zero page overflow. Review both appearances. |
| G8 Phone | Owner checks physical iPhone Safari with software keyboard, pending writes, leave and expired-session recovery and records device, OS, browser, date and outcome. |
| G9 SC-006 | Already signed in on both devices, owner captures Garden / Seed order and finds the body on desktop unaided in at most 120 seconds. |
| G10 Soak and release | No deployed soak or upgrade fixture added. Owner signs each line in one R6 PR to main. Release tagging is a later owner decision. |

M1 uses FR-001–006 and FR-009 only to the extent in the mapped stories. Preserve the existing document and protected-file backend. Pin, Journal, formatting/phone bar, Open Tasks, file controls and wide focus fall outside M1. The owner will reset the roadmap after R6. UAT enhancements 58–64 stay on the [ranked backlog](https://github.com/hsb3/pocketbase-notes-app/issues/48). Use the [execution plan](plan.md), [source coverage](coverage.md), [commands](quickstart.md), [owner checks](owner-check.md) and [tasks](tasks.md).
