# PocketBase Notes

## Platform

web

## Purpose

A private notes and journaling app using the existing React, TanStack Router, Bun and PocketBase stack. The core loop is write, save, find and revisit an entry.

## Capabilities and constraints

Notes and dated journal entries share a ProseKit editor. Title search, journal dates and favorites organize the library. Explicit saves and conflict detection protect drafts. [Open tasks](../features/tasks.md) lists unchecked checklist items across entries. Private image, PDF and text [attachments](../features/attachments.md) use PocketBase with RustFS in the local full stack. Sign-in is email and password, with opt-in [two-step sign-in](../features/auth.md) by emailed code; the theme follows the system or a light/dark choice. No sharing, AI or offline synchronization.

## Design authority

The approved structure and acceptance criteria live in [the design brief](../design/notes-journal.md); [wireframes](../design/wireframes.md) define the three-region desktop workspace and single-region mobile flow. Preserve the existing neutral shadcn theme and reuse prebuilt components.
