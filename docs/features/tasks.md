# Open Tasks

The cross-note Open Tasks screen and its `/entries/tasks` route retired with the entries workspace. The [redesign roadmap](../../specs/002-notes-redesign/versions.md) schedules checklist controls for R9 and an Open Tasks smart folder for R10.

The notes API already derives `open_tasks` and `tasks` from the saved document. These fields hold the unchecked count and the first 100 unchecked items in document order. Account access rules apply to the source note. [Note fields and historical source](notes.md)
