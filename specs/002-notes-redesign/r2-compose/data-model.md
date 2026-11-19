# R2 data and draft lifetime

[Stored fields and indexes](../r1-data-foundation/data-model.md) and [owner rules](../r1-data-foundation/contracts/records.md) remain the R1 record contract. R2 adds one response-only string, `excerpt`, and removes the obsolete `entries` collection.

| Data | Lifetime and invariant |
|---|---|
| Default folder | One `folders` record per ordinary user with `is_default=true`, `name=Notes`, `name_key=NOTES`. Preserve its ID and all custom folders on repeat. Look it up by owner and flag. The virtual All Notes list has no record. |
| Note row | Owner-scoped, active note. A list page returns only `id,folder,title,updated,excerpt`. Detail carries the full body, current revision and ordered attachment IDs. Existing stored text supplies the response-only excerpt after edits and immediately after upgrade. |
| Editor session | Key by authenticated user and stable note ID. Keep latest document, generation number, last acknowledged revision/generation and at most one submitted immutable snapshot. File references remain intact on body-only updates. Never reuse drafts or cached rows across identities. |
| New draft | Compose allocates the ID locally and opens an empty paragraph in the selected folder. From All Notes, resolve the user's default folder. Whitespace-only input creates no record. Reopening a bookmarked ID outside this session performs an owner-scoped read. Missing IDs never bootstrap writable drafts. |
| Dirty → saving → pending/saved | Debounce from the latest edit. Snapshot at dispatch. On success, advance the acknowledged revision only for that submission. If newer edits exist, preserve them and send the latest snapshot when eligible. Show Saved only when acknowledged generation equals current generation. |
| Error | Stop automatic dispatch on a rejected or ambiguous write, show an error and retain local edits. A failed leave stays on the note. An empty/oversized existing edit must never be reported as saved or replace the last valid version. R3 owns repair actions and deliberate discard. |

The entries migration is intentionally destructive under the approved empty-library cutover. Apply only in disposable proofs during implementation. If actual user entries appear at deployment preflight, stop for an owner data decision. A down migration cannot recover deleted data. Use the pre-upgrade backup with the matching app revision for rollback. Historical migrations and the shared `entry-validation.js` helper must remain runnable on a fresh database.
