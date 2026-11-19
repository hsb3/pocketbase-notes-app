# PocketBase Notes

## Purpose

A private, self-hosted web notebook for capturing and reopening writing across devices. React and TanStack Router serve the interface. PocketBase stores folders, notes and protected files.

## Capabilities and constraints

Sign-in opens All Notes. Compose writes to the selected folder, derives the title from the first line and autosaves with a revision check. Phones show one region at a time. Larger screens keep folders, list and editor visible together. Account settings include [two-step sign-in](../features/auth.md). Themes support light, dark and system preferences.

The [notebook guide](../features/notes.md) describes current behavior and planned increments. Drafts live in memory. The app has no sharing or offline synchronization.

## Design authority

The [R2 route and write contract](../../specs/002-notes-redesign/r2-compose/contracts/compose.md) defines navigation, layout and saves. The [notes and journal design](../design/notes-journal.md) and its wireframes document the retired entries interface.
