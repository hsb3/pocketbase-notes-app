# R4 research and decisions

## Which text is searchable?

The roadmap proposed a bound `title ~ {:q} || text ~ {:q}` predicate. The intended set is correct. Its literal SQLite implementation misses non-ASCII case pairs. A planning probe on SQLite 3.53.1 evaluated contains-LIKE for garden/GARDEN, café/CAFÉ and Маяк/МАЯК and returned 1, 0, 0 respectively. This measures SQLite locally. The [API controls](quickstart.md#records-api) repeat both the raw and chosen queries on the pinned server. [SQLite LIKE](https://sqlite.org/lang_expr.html#like)

R1 already implemented the roadmap’s derived-copy contingency. The migration `pb/migrations/1795000000_created_folders_and_notes.js` defines `search_key`; `pb/hooks/notes.pb.js` computes it from original visible text on every validated write. The title is its leading text, or “Untitled note” prepended when the first line is blank. `pb/hooks/comparison-key.js` applies NFC → locale-independent uppercase → NFC. R1’s contract and `noteSearch` in `scripts/test-notes.ts` cover Cyrillic, accents, and the expansion of ß. Adopt this exact key for both terms and data. A second lowercased column would duplicate up to a full document per row and require a historical rewrite. R4’s only migration adds an index. JSON serialization, attachment bytes, filename, mention ID, and link URL contribute no searchable text. [R1 data model](../r1-data-foundation/data-model.md)

## Query, index and payload

Use the ordinary owner-scoped notes records list and one bound substring condition on the combined key. Preserve native counts, ordering and paging. PocketBase compiles the operator to LIKE with a backslash escape and treats an explicitly wildcarded pattern differently from an implicit contains query. The contract supplies both outside percent characters and escapes each interior metacharacter before SDK binding. Quoting the value and specifying literal LIKE semantics solve different problems. [Pinned PocketBase filter implementation](https://github.com/pocketbase/pocketbase/blob/v0.40.1/tools/search/filter.go#L480-L497)

Add one composite index with keys `user, deleted, updated DESC, id DESC`. Its first two keys restrict the candidate rows; the last two provide the exact page order, including timestamp ties. A regular B-tree on the search key cannot seek to an interior substring. FTS changes token semantics and adds database lifecycle work. A folder-leading index would not serve the cross-folder query. Verify the index definition and representative query plan on the contained database. SC-004 measures the real request all the way to the painted row.

R2’s `excerpt` omits the first line and stops after 120 code points. It can miss the only hit in a long note. Instead compute a query-relative window inside the existing list hook after PocketBase has selected and authorized the page. Return three short original-text parts for safe React rendering. A fixed prefix and client filtering after pagination each lose matches. Transferring full text moves up to the document limit per row. A custom HTTP route would duplicate authentication, rule application and paging. [Pinned list handler](https://github.com/pocketbase/pocketbase/blob/v0.40.1/apis/record_crud.go#L57-L99)

## Navigation and controls

Reuse the validated URL search pattern in `git show b94195f:src/features/entries/data.ts` and the live folder route’s page handling. Keep ordinary folder page and search page distinct. Use an explicit form submission (Enter, software keyboard Search, or Search button). It avoids a navigation per keystroke, permits IME composition and lets a writer edit a term beside a dirty document. Selecting a result uses R3’s existing history blocker. Submitting a new search from a selected note is also a guarded departure. [Navigation contract](contracts/search.md#navigation-and-focus)

A dedicated search route would require rebuilding folder provenance and the split workspace. Local-only state would lose the search on refresh. Reuse Input, Button, Empty, Label and the project’s semantic theme tokens. Search does not require a command palette or a shadcn registry addition.
