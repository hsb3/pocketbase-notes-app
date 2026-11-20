
## Final Phase: Gate *(mandatory, always the last phase)*

**Purpose**: The feature is done only when the project gate is green.

- [ ] TXXX Confirm every row of the plan's Verification Plan has its check written and passing
- [ ] TXXX Run the project gate (`.specify/extensions/functionform-gate/scripts/gate.sh full`) and record the result; fix causes in the code, never by changing the gate, skipping a test or adding retries

**Checkpoint**: Gate green. Any remaining known gap is listed for the owner.
