# R4 data model

## Stored notes

Use the existing [R1 records contract](../r1-data-foundation/contracts/records.md). An active note has one owned folder, an empty `deleted`, original `title` and `text`, and a server-derived, filterable `search_key`. Keep the existing export-time hiding of the key. Search reads never change the note or its revision.

Create `pb/migrations/1795000300_index_active_note_search.js`. Load the notes collection, use the collection index API to add `idx_notes_user_deleted_updated_id` over `user, deleted, updated DESC, id DESC` (nonunique, no partial predicate), then save the collection. Down removes just that named index and saves. Preserve every field, rule and other index. Do not resave any note. An R3 note must retain its ID, folder, body, date, revision and derived key across upgrade, rollback of this migration and reapply. Fresh and upgraded databases must both support immediate search.

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

Find the first occurrence of the folded literal in the same source that R1 indexed. Reconstruct the fallback-title prefix only when the first visible line is blank, using the same first-line separators as the save hook. A one-line input cannot cross the synthetic newline. Use the first occurrence in document order, even for repeated matches or a title that also appears in the body.

Return original code points around that occurrence. A fold may compose several source characters or expand one. Treat the full source span that contributed a folded character as its highlight, e.g. original `Straße` for `STRASSE`, decomposed `e + U+0301` for `É`. Never slice the original at a folded UTF-16 offset. An implementable mapping is to split the source at fold-safe boundaries, retaining original offsets and cumulative folded lengths. For ordinary text, group a base with its following combining marks and group composing Hangul Jamo, then fold each group. Check the concatenation against the stored-key rule on the complete source. If the fast mapping differs, resolve the full source recursively: try a cut at the middle original code-point boundary, then cuts in increasing distance from the middle (left first). Accept a cut only if the two independently folded halves concatenate to the folded parent. Descend only into halves containing a match endpoint; a span with no safe interior cut is one contributing group. Map the first and last folded positions to their contributing groups. The ordinary ASCII path has identical offsets. Build the map only for the selected page on the server.

Take up to 32 original code points on either side and up to 160 from the start of the contributing span. Add a single ellipsis at each clipped outside edge, including an elided tail of a long matched span. Return at most 226 displayed code points including both ellipses. Preserve original characters, including whitespace; CSS may wrap them. Render only the middle part in a semantic mark. If a canonical search row has no mappable hit, fail the search visibly rather than sending a misleading preview.
