# R5 decisions and planning probes

## Active pages and purge candidates

The planner executed PocketBase v0.40.1 (upstream commit bc8ffed4), dbx v1.12.0 and its modernc SQLite 3.53.3 in one Go process. The real records-list HTTP handler ran against shared in-memory SQLite via httptest request/recorder, with a signed ordinary user token, real collection fields for the filters/sort and three synthetic active/deleted rows. No network listener or app server was started. The candidate list rule adds the active-date predicate to the R4 owner rule. Unfiltered, folder-filtered and substring-filtered requests returned 200. Active positive controls and absence of both deleted IDs passed. This exercises the query compiler. The staged and browser gates cover the full migrated schema, canonical R4 request, hooks and projections.

The table records the planner output of EXPLAIN on the observed page SELECTs (count SELECTs captured separately) and the two explicit SQL reads. For search, dbx logged this predicate, with field quoting normalized here for readability:

```sql
WHERE (('users' = 'users' AND notes.user = 'aaaaaaaaaaaaaaa'
        AND (notes.deleted = '' OR notes.deleted IS NULL)))
  AND (((notes.deleted = '' OR notes.deleted IS NULL)
        AND notes.search_key LIKE '%LANTERN%' ESCAPE '\'))
ORDER BY notes.updated DESC, notes.id DESC LIMIT 20
```

| Read | Observed SQLite operation | Consequence |
|---|---|---|
| Ordinary owner page, folder page, R4 substring page | SEARCH notes USING INDEX idx_notes_user_updated_id_deleted (user=?), no temporary sort on the three page queries | Keep R4's index and explicit active filter. Adding the server-side list rule also excludes trash from an unfiltered list. |
| Purge: SELECT id FROM notes WHERE deleted > '' AND deleted <= :cutoff ORDER BY deleted,id LIMIT 100 | SEARCH notes USING COVERING INDEX idx_notes_purge (deleted>? AND deleted<?) | Add the small partial index on deleted,id with predicate deleted > ''. Bind the canonical string cutoff. Both comparisons belong in the query. |
| Trash: SELECT id,folder,title,revision,deleted FROM notes WHERE user=:user AND deleted>:cutoff ORDER BY deleted DESC,id DESC LIMIT 20 | Owner seek on the R4 index plus USE TEMP B-TREE FOR ORDER BY | Accept a per-owner sort. No sublinear search or trash latency target is promised. A second owner/deleted sort index would add write cost without a measured need. |

An index starting with user cannot lead a global deadline range seek. A SQLite partial active index on deleted='' also fails to describe the compiled empty-date disjunction. A full-library fetch plus client filtering would leak deleted rows into totals and snippets. The [staged gate](quickstart.md#staged-upgrade) repeats the exact marked owner page on the final schema. Query plans depend on schema, statistics and inputs. [PocketBase v0.40.1 records list](https://github.com/pocketbase/pocketbase/blob/v0.40.1/apis/record_crud.go) · [Pinned filter compiler](https://github.com/pocketbase/pocketbase/blob/v0.40.1/tools/search/filter.go)

The same one-shot probe reversed and reapplied the candidate metadata with three post-up rows, one edited after insertion. All columns compared equal after both operations and the physical index toggled correctly. This rehearsal used the Go collection API. The implementation gate runs the actual migration file, its history and existing upgrade fixture.

## Deadline and comparison engine

The probe ran the Goja version required by the pinned PocketBase go.mod, v0.0.0-20260806115107-493f22071ef6. In UTC, America/New_York and Asia/Kathmandu, explicitly converting the stored space to T and adding 2,592,000,000 milliseconds to 2026-03-01 13:14:15.123Z returned **2026-03-31T13:14:15.123Z**. Deadline−1 ms passed the strict-before check and equality failed in all three zones. Across the same zones the fall case (October 15 → November 14) and leap-year case (February 1 → March 2, 2024) also matched fixed UTC results. Deadline+1 ms failed in all nine checks. New York crossed daylight-saving boundaries. The existing comparison steps on Straße yielded STRASSE in all three runs. R5 copies neither normalization nor search derivation into mutations. A calendar-month delta, local setDate or parsing a zone-less timestamp gives the wrong contract. [Pinned dependencies](https://github.com/pocketbase/pocketbase/blob/v0.40.1/go.mod)

## Transaction and navigation choices

- A narrow action endpoint accepts an expected revision and only its action operands. Opening ordinary PATCH to arbitrary folder/deleted payloads would mix metadata with content derivation, date autodating and field modifiers. Raw bound metadata updates keep writing, search bytes and edit timestamps intact. The records API continues to validate all normal saves.
- Hash the sorted membership/revision snapshot rather than accepting a count. A move out followed by another move in preserves the count, and an edit changes no membership. The confirmation would authorize different work. The server has the full snapshot and returns a fixed-size digest. A transaction around independent client deletes could not guarantee all-or-nothing folder removal. Preserve the already-deleted timestamps of previously trashed members. Resetting them would grant extra retention.
- Retain shared files until the last referencing note is actually purged. Global attachment-age cleanup alone delays removal of newly uploaded files belonging only to expired notes. Deleting every attached file would break other notes. Use PocketBase record deletion so protected file cleanup runs.
- Use the existing library route with a reserved non-ID segment for Recently Deleted. An editable trash-detail route would give R3 an invalid active folder and add another editor state. A Move sheet inside detail keeps the link stable and the R4 return context intact. Reusing the navigation guard unchanged would dispose a dirty draft even after a successful flush on its non-navigation continuation.
- Server-triggered refresh on every browser is outside the existing list/read contract. The initiating session refreshes on confirmed mutation. The strong guarantee is immediate exclusion on authoritative reads and preservation on a competing save. Blank lists and transport errors must remain distinguishable.
