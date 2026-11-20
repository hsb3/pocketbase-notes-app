---
description: "Run the project's full gate and report the result"
scripts:
  sh: scripts/gate.sh full
---

# Run the gate

Run the project's full gate from the project root:

```bash
{SCRIPT}
```

## Rules

1. The gate passes only when the script exits 0. Report the exit code and the last failing lines of output.
2. If it fails, the feature is not complete. Do not tick tasks or claim completion on a failed gate.
3. Fix the cause in the code, then rerun. Never edit the gate command, skip a test, or add a retry to make it pass.
4. Stop after 3 failed runs and report what still fails.
5. If the script says no gate command is set, stop and ask the owner to set `full:` in
   `.specify/extensions/functionform-gate/functionform-gate-config.yml`.

## User input

$ARGUMENTS
