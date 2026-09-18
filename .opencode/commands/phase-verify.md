---
description: Independently verify the current phase's gate (tests + benchmark) before opening a PR
agent: verifier
subtask: true
---

Verify the current phase against its gate, as defined in @AGENTS.md §7 and
this phase's `### Tests` / `### Benchmark` sections in @docs/PHASED_PLAN.md.

Current state for reference:

!`cat .opencode/STATE.md`

Run the full verification sequence described in your own agent instructions
and end with the `VERIFIER REPORT` block. Do not skip the benchmark step
silently if the phase has one defined — if you skip it, say explicitly why.
