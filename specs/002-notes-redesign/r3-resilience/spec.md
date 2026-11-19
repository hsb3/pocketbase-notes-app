# R3 scope · Save resilience

A writer can recover an interrupted save in the open tab without losing the latest draft, replacing someone else's newer edit or creating a second note. This increment implements the [R3 release slice](../versions.md#r3-save-resilience) of the [approved notes specification](../spec.md). [Save resilience work item #38](https://github.com/hsb3/pocketbase-notes-app/issues/38)

| Acceptance | R3 outcome |
|---|---|
| Story 1.3–1.4 · FR-003 | Serialize writes, acknowledge only submitted edits, flush on navigation, retain failed edits and retry the latest text. Resolve lost POST and PATCH replies through the R1 owner read-back contract. |
| Story 1.5 | Same-account reauthentication can resume the open draft. Another account can neither see it nor submit it. |
| Story 1.6 · interrupted saves | Keep both versions on a conflict. Copy the current draft, cancel, or confirm replacement with the saved document. An unavailable source leaves the local words copyable. |
| Story 7.3 · FR-003 | Guard sign-out as well as navigation. Offer successful save, explicit discard and return to editing. |
| Empty or oversized writing | Abandon a new blank draft without creating a note. Keep invalid edits and the last valid saved note when clearing it or exceeding 102400 encoded document bytes. Preserve supported existing attachment-only notes. |
| SC-002 | Start a healthy save within one second of the last edit. Throughout a three-second delayed reply, show outstanding work. Show retry feedback within one second of known failure. |
| SC-003 | In each of five browser scenarios, zero silently lost drafts, newer versions overwritten or duplicate records. Repeat each ten consecutive times on Chromium and WebKit at R6. |

R1 owns the records and revision contract. R2 owns Compose and successful autosave. R3 changes the client and its tests. Search, move, delete, attachment controls, offline sync and recovery after tab loss remain in their [scheduled increments or exclusions](../versions.md).
