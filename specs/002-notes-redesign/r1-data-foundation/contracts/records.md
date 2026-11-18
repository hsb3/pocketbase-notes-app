# Records and access contract

## R1 records

Use standard PocketBase list, view, create, update and delete for folders and notes. Register all five rules independently on each collection. Let **Own** mean an authenticated ordinary user and the record’s user equals that identity.

| Collection | List | View | Create | Update | Delete |
|---|---|---|---|---|---|
| folders | Own | Own | Own on submitted owner; ordinary requests cannot set default | Own, ownership immutable; protect default/name/key; no rename operation in R1 | Own; reject default or nonempty in transaction |
| notes | Own | Own | Own; owned active folder and attachments validated | Own, ownership immutable; validate submitted revision, folder, body and files | Own; reject ordinary hard delete before any removal |

List/view rules remain owner-scoped so R5 can offer a separate Recently Deleted view. A shared **active predicate** (deleted empty plus owner access rules) scopes all ordinary listings and searches, starting with R1 API fixtures; R2 uses it for the first redesigned library reader. R1 does not expose a trash mutation. Ordinary requests must not set deleted, create a default folder, change the default flag, change owner or move an existing note before R5. Model validation derives keys and document projections from trusted source fields regardless of submitted projections. Initialize revision on create; accept only the current integral revision as an update precondition, then increment atomically. A mismatch or missing precondition yields 409 with no mutation. Guard protected fields against modifier-style as well as direct changes. Administrative fixtures use their privileged access only to arrange and inspect state.

**Proof matrix.** For each collection, A creates and reads a known record. Positive list/view/update coverage must demonstrate the intended operation (for folders, an owner no-op is sufficient while rename is deferred). B and anonymous list yield 200 with no A records, direct view/update/delete 404, attempted create for A 400. Test anonymous access using known IDs. Invalid owned data or forbidden destructive operations fail without changing records; verify with owner read-back. A can delete an empty custom folder only. Test owner file-token download as a positive control. The same file path must deny an anonymous caller without a token and B with B’s own file token.

## Request and response lifecycle through R11

| First increment | Contract |
|---|---|
| R1 | Create folder with owner and display name. Create note with id (optional in API), owner, folder, body and attachments; receive the R1 fields in the [model](../data-model.md). Update content with revision. GET after replay proves identity. Attachment-only is valid. Shared reads expose computed values, never trust client counts. |
| R2 / R3 | First autosave supplies stable ID. Later saves send revision. R3 distinguishes failed acknowledgement from conflicting saved content using owner-scoped read-back; preserve the latest draft. See [research](../research.md). |
| R4 | Paged active results across folders from a bound literal normalized query. Return ID, title, folder context and original matching text for snippets. Never search document serialization or file contents. Cap results per page (20). |
| R5 | Owner move, soft delete and restore all require current revision. Reject stale writes with 409; increment revision on each transition, including folder-wide deletion of affected notes. Bulk folder removal checks affected revisions against the confirmed snapshot and rolls the whole change back on mismatch. Require explicit, owner-scoped deleted reads; pin/date/tasks/files survive recovery. R6 has verification only. |
| R7 / R8 | Pin or unpin, set/change/clear journal date as revision-checked note updates. Pinned and Journal list active notes across folders. |
| R9 / R10 | Rich documents use the R1 format. Open Tasks reads active projections and completes the selected source item against the observed revision; a stale path cannot check another item. |
| R11 | Attach or detach owned files through the revision-checked source note. Only acknowledge the note and attachments when both upload and write succeed. Retained notes keep file references until permanent purge. |
