# Specification Quality Checklist: Personal notes across phone, tablet and desktop

**Purpose**: Validate the feature specification before planning.

**Created**: 2026-11-18

**Feature**: [Apple Notes redesign](../spec.md)

## Content Quality

- [x] Describes outcomes independently of implementation choices.
- [x] Focuses on private capture, organization, retrieval and recovery.
- [x] Uses language a writer can understand.
- [x] Completes all mandatory template sections.

## Requirement Completeness

- [x] No unresolved clarification markers remain.
- [x] Requirements specify observable behaviors and failure outcomes.
- [x] Success criteria identify measurable thresholds or exact expected results.
- [x] Success criteria can be checked independently of the chosen technology.
- [x] Each story has Given/When/Then acceptance scenarios.
- [x] Edge cases cover isolation, concurrent edits, invalid inputs and destructive actions.
- [x] Scope includes responsive web and identifies the exclusions.
- [x] Dependencies and proposed defaults are labeled.

## Feature Readiness

- [x] Every functional requirement identifies its acceptance scenarios.
- [x] Independently exercisable stories cover the primary journeys.
- [x] Success criteria define how to judge the feature against the intended outcomes.
- [x] The specification leaves implementation design to planning.

## Notes

- The review traced FR-001 through FR-009 to their stories and edge cases. The named revision conflict (409) is the existing observable contract. The spec prescribes no storage, client framework or transport design.
- During review, Story 1 was tightened to require the latest edits after retry and specify the failed-navigation choice. SC-005 now explicitly requires a real phone and its software keyboard.
- The four approved product decisions are recorded in Stories 1, 2, 4 and 5. Thirty-day retention and the restore fallback are labeled assumptions. This checklist validates the specification; the success criteria are targets for future verification.
