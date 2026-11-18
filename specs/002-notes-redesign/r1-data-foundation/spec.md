# R1 · Private folder and note storage

Authority: [approved feature](../spec.md), [R1 scope and exit criteria](../versions.md#r1-data-foundation-backend-only), [R1 tracking issue](https://github.com/hsb3/pocketbase-notes-app/issues/35).

**US1 (P1, backend slice of parent Story 1).** Given two accounts and a signed-out reader, when each account creates and edits notes in its own folders, then only the owner can access them, all derived values agree with the document, and exactly one of two competing writes succeeds. Demonstrate using the records interface while the existing app still uses entries.

| R1 requirement | Acceptance boundary |
|---|---|
| F1. Private folders | Five owner-scoped rules, permanent Notes folder provisioned for signup, seed and administrative account creation, trimmed unique names and protected system names. |
| F2. Private notes | Five owner-scoped rules, owned folder for active notes, immutable owner, protected attachment references, no client-driven deletion transition. |
| F3. Derivation | Full existing document format accepted; empty/oversized body denied; title, text, open count and task descriptions computed on every save. |
| F4. Write safety | Stable create identity, revision initialized to one, concurrent updates from the same revision yield one success and one 409. |
| F5. Coexistence | New migrations and generated types alongside entries; private file cleanup recognizes both collections. Existing app and checks stay green. |

FR-001 and the revision portion of FR-003 are in scope, with API evidence toward SC-003 and SC-004 privacy. FR-002 title derivation and FR-007 task data are prerequisites only. No complete user-visible story or end-to-end SC closes in R1. Delivery excludes frontend, writes to deleted, pin/date fields, search interface, recovery and backfill. Later contracts in this directory describe sequencing only.
