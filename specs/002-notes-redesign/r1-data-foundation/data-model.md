# Record model and increment ownership

The parent [increment map](../versions.md) owns delivery order. Fields below marked R1 ship together. Later rows document additive changes or consumers; they create no R1 UI tasks.

| Record / added in | Fields and constraints |
|---|---|
| Both collections · R1 | System ID, exactly 15 lowercase ASCII letters/digits; server timestamps created and updated. Required immutable single user relation. Deleting the account removes its records. |
| folders · R1 | name: trimmed, 1–80 Unicode code points; name_key: server-derived comparison key, unique per user. is_default: boolean, server-controlled, exactly one true per ordinary account. Notes is reserved for its system folder. Other reserved keys: All Notes, Pinned, Journal, Open Tasks, Recently Deleted. |
| notes · R1 | folder: single relation, schema-optional, no cascading deletion; required and owned while active. body: existing full validated document, maximum encoded size 102400 bytes, existing structural/depth limits. Reject whitespace-only without substantive content or attachments. attachments: 0–20 unique existing owner file IDs, embedded private image IDs must be included. |
| notes · R1 | revision: server-controlled positive integer, starts at 1; updates require current revision. deleted: empty date while active, protected from client writes. |
| notes · R1 | title: first logical line, up to 160 Unicode code points, blank becomes “Untitled note”; no truncation of body. text: original plain searchable content including first line; search_key: same content transformed by the comparison rule, including the display fallback title when needed. Make search_key filterable by an ordinary owner under the list rule; omit it from list response projections. PocketBase hides hidden fields from ordinary filtering. Capacity must accommodate the full valid input and case expansion. |
| notes · R1 | open_tasks: exact nonnegative unchecked count. tasks: first 100 unchecked items in document order, each with an integer child-index path and label limited to 200 characters by the existing extractor. Both derived. |
| attachments · existing, R1 coexistence | Reuse immutable owner, original filename, protected file and timestamps. Existing PNG/JPEG/WebP/GIF/PDF/plain-text/Markdown types and 10 MB limit. Check references from entries AND notes in deletion, orphan candidate selection and transactional recheck. |
| R2–R3 | No added note fields. R2 uses fixed ID for first save, removes entries in its own migration. R3 reconciles acknowledgements. Draft snapshot and queued edits are session-local. |
| R4 | Add list/search index (user, deleted, updated). Use existing search_key for literal matching and original text for snippets. |
| R5–R6 | R5 populates deleted with a server-assigned instant; no new field. Individual deletion retains folder if available. Folder deletion clears references and trashes contents atomically. Restore before 30 elapsed days to original or default folder; after expiry refuse restoration even before daily purge. Purge only unreferenced files. R6 adds no fields. |
| R7 | notes.pinned: boolean, initially false; index for owner, active state and pin ordering. Pin persists through move and recovery. |
| R8 | notes.journal_date: empty or valid calendar date YYYY-MM-DD, no time zone or daily uniqueness; index (user, journal_date). Independent of real folder. |
| R9–R11 | No new fields. R9 edits the existing rich body. R10 uses task projections and revision-checked source writes. R11 exposes private attachments; links on retained deleted notes still protect files from cleanup. |

Project text by walking validated content in document order. Join adjacent inline text across marks without inserting spaces; hard breaks, block boundaries and literal line breaks delimit lines. Include visible mention labels; ignore internal node names, mark attributes, file bytes and URLs used solely as metadata. An empty leading block counts as a blank first line. Store the full original plain text for excerpts. Layout wrapping does not create a line break.
