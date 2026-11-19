# R4 data model

## Stored notes

Use the existing [R1 records contract](../r1-data-foundation/contracts/records.md). An active note has one owned folder, an empty `deleted`, original `title` and `text`, and a server-derived, filterable `search_key`. Keep the existing export-time hiding of the key. Search reads never change the note or its revision.

### Comparison key on every validated save

Let `F(s)` be the existing `comparison-key.js` function (NFC → locale-independent uppercase → NFC). Retain the current extraction of `text` from the validated document. Split its first line at CR, LF, U+2028 or U+2029. If the first line trims to empty, the displayed title is “Untitled note”. Otherwise it is the first 160 **original code points** of that line, including its original spacing.

1. Build the R3 source `S`: for a blank first line use `[title, text].filter(Boolean).join("\n")`, otherwise use `text`. Let `B = F(S)` and `T = F(title)`.
2. If `B.includes(T)`, store exactly `B`. Otherwise store `T + "\n" + B`. The added LF separates two independently folded sources. A single-line query cannot match across it. Recompute from current title and text on create and every update, including transitions into and out of the title-boundary case.
3. Preview sources in priority order are `[S]` for the first branch and `[title, S]` for the second. Select the first source whose fold contains the query and its first occurrence there. This preserves original title spelling for a title-only hit and still finds body-only terms on a repaired row.

### Upgrade and rollback

Create one new migration, `pb/migrations/1795000300_repair_active_note_search.js`. Ship a frozen copy of the above key calculation in the migration so replay remains independent of later hook changes. In its migration transaction, scan **all** notes (including deleted) by ascending ID in batches of 100, seeking past the last ID. Read only ID, stored title, text and key. Derive the expected R3 and R4 values from the stored original strings. For rows where they differ, update only `search_key` using bound SQL on ID and the expected old key. Skip rows already at the target. For a differing row with neither expected value, or an intended update affecting other than one row, fail the transaction with the ID. Rows whose two expected keys agree receive no write. Use the migration's app/transaction for both metadata and SQL. A record save would run validation and could advance the dates.

Up converts R3 → R4 and ensures the notes collection has the nonunique, unconditional `idx_notes_user_deleted_updated_id` on `user, deleted, updated DESC, id DESC`. Use the collection index API and save the collection only for an index change. A same-name index with a different definition is an error. Down removes just that named index if present and reverses R4 → R3 from each row's **current** title and text. This also handles affected notes created or edited since upgrade. Roll back with R3 application code. On the R3 representation the title-boundary miss is expected until reapply.

Repeated up or down at its target changes no row. In both directions preserve IDs, ownership, folder, body, original title/text, tasks, attachments, revision, created/updated/deleted dates, every other column, field, rule and index. The [staged checks](quickstart.md#staged-upgrade) compare column values and exercise the owner API.

## Request and response values

| Value | Lifetime and invariant |
|---|---|
| Query | Original display spelling after outer trim, at most 160 Unicode code points. One line. Empty means ordinary folder mode. Treat percent, underscore, quotes and backslash as writing. |
| Bound pattern | NFC → uppercase → NFC of query. Escape backslash, percent and underscore with backslash, in a single pass. Surround with unescaped percent on both ends. Used exclusively as the value passed to the SDK filter binder. |
| Search row | One ID, actual folder ID, original title, update time, and a virtual snippet with three plain strings (before, match, after). Folder display names come from the existing owner’s folder list. No per-result GET. |
| Folder URL | Path chooses the originating folder or All Notes. Optional `page` is the original ordinary-list page. Optional `q` activates search. Optional `sp` is its result page. Omit first pages. |
| List position | R2 folder, scroll, focused row, ordinary page and `fromList`, plus submitted query and result page. Carry these in note navigation history state. The folder URL remains the durable reconstruction of query and pages. |
| Pending work | Field text before Submit stays local. Key displayed rows and request completion by owner/session, folder, query, and effective page. Save acknowledgements refresh the current projection. Ignore superseded responses and hide old rows during loading/error. |

## Snippet mapping

Use the preview source and folded occurrence selected above. Locate both ends in **folded code points** and return original code points. Expansion can map both ends to one character (`SS` in Straße). Composition can map one folded point to several original ones (decomposed `e + U+0301`).

1. Group bases with following marks and composing Hangul Jamo, recording original offsets and cumulative folded lengths. Use these groups if their folded concatenation equals the whole source fold. Otherwise start with the entire source as one group. The ASCII path has identical offsets.
2. **Always refine both endpoint groups**, even when whole-source parity passes. Within each such group try the midpoint cut (round down in original code points). Split only where `F(left) + F(right) === F(group)`. Rebase the folded offsets into the overlapping child or children. Stop at one original point. If the midpoint fails the fold check, use the exact mapping in step 3 on that group. This avoids testing every possible cut in a long run of reordered marks. Include fully matched interior groups.
3. For a group with an unsafe midpoint, trace the contributing originals for the overlapping folded positions. For each NFC step, decompose each input point to NFD carrying its original index set. Queue those tags by decomposed character in input order. Walk each NFC output point's NFD and consume the corresponding tags FIFO, taking their union for that output point (canonical reordering is stable for equal characters). Between the two NFC steps each uppercase expansion inherits its input tags. This handles reordered marks and compositions across intervening marks. Use the earliest and latest true contributors as the original span. Work on the selected server page only.
4. Mark the whole original span when it fits 160 code points. For a longer span, keep its first 79 and last 80 original points with one ellipsis between them in `match`. Both contributing endpoints remain visible. Take up to 32 adjacent original code points before and after the full span. Add one outer ellipsis to each clipped context side. Thus `before` and `after` each fit 33, `match` fits 160, and the total fits 226 including all ellipses. Context is clipped only after locating the evidence. Return plain strings whose middle is rendered as a semantic mark. Fail a canonical row visibly if its selected source has no mappable hit.
