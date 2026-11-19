# R5 scope · Move, delete and recover

A writer can move an open note to another folder, remove a note or folder from the library, and restore the writing for 30 elapsed days. This is the R5 slice of the [approved stories and recovery policy](../spec.md), [release sequence](../versions.md#r5-move-delete-and-recover) and [Move, delete and recover notes, issue 40](https://github.com/hsb3/pocketbase-notes-app/issues/40).

| ID | Observable acceptance |
|---|---|
| A1 · Story 2.1, FR-005 move | Given a saved note in Notes, Move to Garden keeps its ID, writing and open URL. Cancel keeps Notes. The source list loses the row, Garden gains it, and a matching search shows Garden. |
| A2 · Story 3.1, FR-006 | An individually deleted note disappears from active lists and search immediately. Only its writer can find it in Recently Deleted with its deadline. |
| A3 · Story 3.2, FR-001 default | Deleting Garden previews its name, active note count and recovery policy. Cancel changes nothing. Confirm removes Garden and trashes its active contents together. A changed snapshot refuses the entire action. The permanent Notes folder survives. |
| A4 · Story 3.3, FR-006 | Restore before the deadline returns the exact note and its attachments to the original folder if it still exists, otherwise to Notes. A removed folder stays removed. At deletion plus exactly 30 elapsed days recovery ends. Daily purge removes expired notes and requests physical deletion of exclusive files. Shared files survive. Logged private-storage leftovers after a worker failure receive manual operator cleanup. |
| A5 · Interrupted actions, FR-003 revision, SC-003 relevant recovery | A stale move, delete or restore returns 409 with no write. A writer whose source was deleted elsewhere can still copy the latest unsaved words. Retry after an uncertain reply cannot overwrite a later edit, trash again or extend retention. |
| A6 · Privacy edge, SC-004 active search | A second user and a guest cannot discover or change another writer’s notes, folder contents or files. Forged ownership and cross-account destinations fail. Restore makes the original search match available again. |
| A7 · Story 7.2 and SC-005 relevant checks | Move, delete, cancel, recovery and return focus work by keyboard at 390, 810 and 1440 CSS px in both themes, without horizontal page scrolling. |

R5 covers existing document, task projections and private file references at the API. Pin, journal date, task views and attachment controls gain their user-facing checks in R7–R11. Physical devices, the cross-device milestone and repeated stabilization gates belong to R6. The owner ruled out deployment soak and a second upgrade fixture.
