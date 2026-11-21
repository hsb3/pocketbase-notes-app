# PocketBase Notes

A private, self-hosted notebook for capturing writing on a phone and finding it again on a desktop. React and TanStack Router handle navigation and editing. PocketBase stores each account’s folders, notes and protected files.

## The notebook today

**Compose** starts a note in the selected folder. The first logical line supplies the title. Autosave uses a stable note ID and checks the saved revision so that an older draft cannot overwrite a newer version. After **Saved**, sign in to the same account on another device and search for words in the title or body. If a save fails, keep the tab open to recover its in-memory draft. [Notes and draft recovery](../features/notes.md)

A phone shows folders, list or editor one at a time. At wider sizes they share a workspace. A move keeps the note’s address. Deleting a note sends it to the account’s Recently Deleted list, where it can be restored before its 30-day deadline. Deleting a custom folder also sends its active notes there. Account settings include optional two-step sign-in. [Folders and recovery](../features/folders.md) · [Account security](../features/auth.md)

Writing is private between accounts. The server operator has access to stored data. Existing rich content and protected image references survive editing. Sharing and offline synchronization are outside the notebook’s scope. [Protected attachments](../features/attachments.md)

## Milestone 1

R6 checks the R1–R5 capture, find, file and recovery flows. The gate includes physical iPhone Safari checks and a timed phone-to-desktop search. The owner revisits the roadmap after Milestone 1. [Milestone 1 gate](../../specs/002-notes-redesign/r6-gate/spec.md)

The [redesign specification](../../specs/002-notes-redesign/spec.md) defines the product requirements. The [notes and journal design](../design/notes-journal.md) and its wireframes document the retired entries interface.
