# PocketBase Notes

## Platform

web

## Purpose

A private notes and journaling demo using the existing React, TanStack Router, Bun and PocketBase stack. The core loop is write, save, find and revisit an entry.

## Capabilities and constraints

Notes and dated journal entries share a ProseKit editor. Title search, journal dates and favorites organize the library. Explicit saves and conflict detection protect drafts. Private image, PDF and text attachments use PocketBase with RustFS in the local full stack. No sharing, AI or offline synchronization.

## Design authority

The approved structure and acceptance criteria live in [the design brief](design/notes-journal.md); [wireframes](design/notes-journal-wireframes.html) define the three-region desktop workspace and single-region mobile flow. Preserve the existing neutral shadcn theme and reuse prebuilt components.
