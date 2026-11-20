---
description: "Quick gate run by the agent's stop event; blocks the stop when it fails"
scripts:
  sh: scripts/gate.sh stop
---

# Quick gate on stop

This command backs the `stop` runtime event. Spec Kit runs its script directly; this text is not sent to the agent.

```bash
{SCRIPT}
```
