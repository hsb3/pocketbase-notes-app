# R4 scope · Search across folders

A writer can find a note by a word in its body from any folder, see why it matched, open it and go Back to the same results. This increment delivers the [R4 release slice](../versions.md#r4-search-across-folders) of the [approved notes specification](../spec.md). [Search titles and body text across folders, issue 39](https://github.com/hsb3/pocketbase-notes-app/issues/39)

| Acceptance | Observable outcome |
|---|---|
| A1 · Story 1.2 second half (P1), FR-004 | From All Notes or a custom folder, a literal case-insensitive substring in any active owned title or visible body yields one row per note, with title, actual folder and highlighted matching text in context. Includes accents and non-Latin scripts. |
| A2 · Privacy, Story 3.1 search edge | A finds A’s unique term. B and an anonymous reader get zero hits. A also gets zero for B’s unique term, deleted notes, document structure and attachment-only contents. |
| A3 · Story 1.2, empty results | Opening a result uses the existing dirty-draft leave guard. Back restores the search, page and row. A miss retains the query, shows “No matching notes” and offers Clear, which returns to the originating folder or All Notes. |
| A4 · Story 7.2 Search placement, relevant SC-005 checks | At 390 CSS px the search field and Compose are reachable at the foot of the list. At 810 and 1440 the field is above results. Keyboard-only operation, visible focus, light and dark, and zero horizontal page scroll hold on both engines. |
| A5 · SC-004 | With exactly 100 active notes across five folders, each unique body-only search finds its correct note and highlighted snippet. In each engine/width combination, at least 19 of 20 searches take less than 2000 ms. Record the individual measurements. |

R3 supplies save recovery. R5 supplies trash mutations. Use a contained deleted-record fixture for A2. Folder-only search, OCR, attachment indexing, native clients and the physical-phone/cross-device R6 release sign-off belong outside this increment.
