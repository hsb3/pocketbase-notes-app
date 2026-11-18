# R2 · Folders, list and compose

A writer can create Garden at 390px, tap Compose once, type “Seed order”, press Return, type “Buy calendula for the south wall”, and find exactly one saved note with those words in Garden in a second signed-in browser. This is the first usable slice of [the approved redesign](../spec.md). The [R2 increment](../versions.md#r2-folders-list-and-compose-with-autosave), [folder provisioning requirement](https://github.com/hsb3/pocketbase-notes-app/issues/37#issuecomment-6991152269) and [server excerpt decision](https://github.com/hsb3/pocketbase-notes-app/issues/33#issuecomment-6989506662) define its boundary.

| Scope | Acceptance |
|---|---|
| C1 · US1, P1 · FR-001 folder slice | Every existing and new ordinary account has exactly one permanent Notes folder. Create an owned folder. Blank, reserved and duplicate names leave the input available for correction. |
| C2 · US1 · Story 1.1 and first half of 1.2, FR-002 | One editable document supplies title and body. Wrapping preserves the title, a blank first line uses “Untitled note”, leaving a new whitespace-only draft creates nothing. Reopen exact saved words on desktop. |
| C3 · US1 · Story 1.3 happy path, FR-003 serialization slice | Autosave after a pause, one request per note at a time. Newer typing survives an older acknowledgement. In-app navigation flushes the latest content. Failures show a visible error. |
| C4 · US1 · SC-001 | At 390px, at least 19 of 20 warm Compose taps accept one character exactly once within one second with no second tap. |
| C5 · US7, P3 · Stories 7.2 without Search and 7.3 Account link, FR-009 layout slice, SC-005 width slice | Folders → list → note → Back at 390px restores the prior list position. At 810 and 1440px folders, list and document share the screen. Capture works at all three widths without horizontal page scrolling. Account is reachable by keyboard from the foot of Folders. |
| C6 · US1 · Cutover | Private active-only lists return titles and bounded server excerpts. Drop entries, retire the old UI and adapt its callers. Protected attachment operations continue to pass against notes. |

R3 owns retry, ambiguous acknowledgements, expiry, conflict resolution and the sign-out/discard choice. R4 adds search, R5 move and recovery. Pin, Journal, Open Tasks, formatting and upload controls, folder collapse and writing focus return in later increments. SC-002, SC-003, the full SC-005 and the physical-device milestone stay open.
