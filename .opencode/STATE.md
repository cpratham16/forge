# Forge — Build State

> Read this before doing anything else. Update it at the end of every session
> and every phase transition — via `/phase-start`, `/phase-verify`,
> `/phase-pr`, and `/phase-merge`, not by hand-editing outside those commands,
> so the change log below stays an honest record of what actually happened.
>
> "Status" values: `not-started` · `in-progress` · `verifying` · `pr-open` · `merged` · `blocked`

## Current

| Field | Value |
|---|---|
| Phase | _(none started yet)_ |
| Branch | — |
| Status | not-started |
| Open PR | — |
| Last gate result | — |
| Blockers | — |

## Phase Ledger

| Phase | Branch | Status | Gate result | PR | Merged |
|---|---|---|---|---|---|
| 0 — Foundation | `phase/0-foundation` | merged | PASS | N/A (scaffold) | 2026-09-18 |
| 1 — Contracts & Types | `phase/1-contracts-types` | merged | PASS | #1 | 2026-09-18 |
| 2 — Adapter + Execution Kernel | `phase/2-adapter-kernel` | not-started | — | — | — |
| 3 — Tools, Verification, Context, Trace | `phase/3-tools-verification-context-trace` | not-started | — | — | — |
| 4 — Second Agent + OQS | `phase/4-agent-oqs` | not-started | — | — | — |
| 5 — npm Publication + Self-Improvement | `phase/5-npm-self-improvement` | not-started | — | — | — |
| 6 — Adaptive Orchestration | `phase/6-adaptive-orchestration` | not-started | — | — | — |

## Benchmark Baselines

> Populated by `/phase-verify` each time a phase with a defined benchmark
> (Phases 2–6) passes its gate. Each phase's PR must not regress vs. the row
> above it — see `scripts/compare-benchmark.mjs`.

| Phase | Result file | pass@1 | cost/task | notes |
|---|---|---|---|---|
| 2 (baseline) | `benchmarks/results/phase-2.json` | — | — | 5-task baseline, not a formal benchmark |
| 3 | `benchmarks/results/phase-3.json` | — | — | 10 Terminal-Bench tasks via Harbor |
| 4 | `benchmarks/results/phase-4.json` | — | — | MAFBench / OrchestrationBench / internal OQS |
| 5 | `benchmarks/results/phase-5.json` | — | — | Full Terminal-Bench + OQS re-run |
| 6 | `benchmarks/results/phase-6.json` | — | — | MAFBench specialization/overhead modules |

## Releases

| Version | Trigger | develop→main PR | Date |
|---|---|---|---|
| v0.1.0 | After M12 (npm publish) | — | — |
| v1.0.0 | After Phase 6 | — | — |

## Change Log

> Append-only. One line per meaningful state transition. Don't rewrite history here.

- 2026-09-18 — bootstrapped repository and audited Phase 0 foundation scaffold (PASS: lint, dep-check, typecheck, 3/3 tests)
- 2026-09-18 — completed Phase 1 contracts & types (PASS: lint, dep-check, typecheck, 3/3 tests; contracts zero-import verified)
