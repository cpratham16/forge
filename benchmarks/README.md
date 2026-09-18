# Benchmarks

Per-phase benchmark runners. `scripts/bench-phase.mjs` dispatches here by phase
number; `scripts/compare-benchmark.mjs` gates PRs on the results.

| Phase | Runner | Measures |
|---|---|---|
| 0–1 | none | No benchmark defined in docs/PHASED_PLAN.md — do not invent one |
| 2 | `baseline/` | 5 simple tasks: tokens, latency, success rate. The reference baseline. |
| 3 | `terminal-bench/` | 10 Terminal-Bench tasks via **Harbor** |
| 4 | `oqs/` | MAFBench, OrchestrationBench, internal OQS five-dimension scorer |
| 5 | `terminal-bench/` | Full re-run + full OQS evaluation |
| 6 | `maf/` | MAFBench specialization + framework overhead modules |

## Harbor is a Python CLI

Harbor is installed with `pip install harbor` / `uv tool install harbor` and
invoked as a subprocess. It is **not** an npm package — see the correction note
in docs/PHASED_PLAN.md Phase 3. The CI workflow sets up Python for this reason.

## Result shape

Runners export `run({ phase })` returning:

```json
{
  "passAt1": 0.42,
  "costPerTaskUsd": 0.85,
  "latencyP50Seconds": 41.2,
  "taskCount": 10
}
```

Committed baselines live at `results/phase-<N>.json`. Candidate runs
(`*-candidate.json`) are gitignored — only a merged, gate-passing run becomes a
baseline, written by `/phase-merge`.

## Publishing methodology

Phase 5 requires publishing the full methodology alongside any external result:
model, harness version, prompt version, tools, context strategy, agent strategy,
sandbox, retry policy, verification policy, token usage, time, cost. The reason
is in docs/RESEARCH_AND_DISCUSSION.md Part 3 — unreported harnesses are exactly
what makes vendor benchmark claims unusable.
