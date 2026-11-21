# Open Tasks

The cross-note Open Tasks screen and its `/entries/tasks` route retired with the entries workspace. Checklist controls and an Open Tasks view are outside Milestone 1. The owner revisits the roadmap after Milestone 1. [Milestone scope](../architecture/spec.md)

The notes API already derives `open_tasks` and `tasks` from the saved document. These fields hold the unchecked count and the first 100 unchecked items in document order. Account access rules apply to the source note. [Note fields and historical source](notes.md)
