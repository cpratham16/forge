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
| Phase | 7 — Capability Isolation + v1.0 Gate Completion |
| Branch | `phase/7-capability-isolation-v1` |
| Status | merged |
| Open PR | — |
| Last gate result | PASS (lint, dep-check, typecheck, 180/182 tests; bench OQS 0.860, rigor 1.000, cost $0.0123, self-improvement 3/4; Terminal-Bench not_observed) |
| Blockers | Terminal-Bench real eval deferred (Harbor binary present but FORGE_HARBOR_CONFIG unset) — not a merge blocker; honest not_observed per AGENTS.md §11 |

## Phase Ledger

| Phase | Branch | Status | Gate result | PR | Merged |
|---|---|---|---|---|---|
| 0 — Foundation | `phase/0-foundation` | merged | PASS | N/A (scaffold) | 2026-09-18 |
| 1 — Contracts & Types | `phase/1-contracts-types` | merged | PASS | #1 | 2026-09-18 |
| 2 — Adapter + Execution Kernel | `phase/2-adapter-kernel` | merged | PASS | #2 | 2026-09-18 |
| 3 — Tools, Verification, Context, Trace | `phase/3-tools-verification-context-trace` | merged | PASS | #3 | 2026-09-18 |
| 4 — Second Agent + OQS | `phase/4-agent-oqs` | merged | PASS | #4 | 2026-09-18 |
| 5 — npm Publication + Self-Improvement | `phase/5-npm-self-improvement` | merged | PASS | #5, #6 | 2026-09-19 |
| 6 — Adaptive Orchestration | `phase/6-adaptive-orchestration` | merged | PASS | #8 | 2026-09-19 |
| 7 — Capability Isolation + v1.0 Gate Completion | `phase/7-capability-isolation-v1` | merged | PASS | #9 | 2026-09-19 |

## Benchmark Baselines

> Populated by `/phase-verify` each time a phase with a defined benchmark
> (Phases 2–7) passes its gate. Each phase's PR must not regress vs. the row
> above it — see `scripts/compare-benchmark.mjs`.

| Phase | Result file | pass@1 | cost/task | notes |
|---|---|---|---|---|
| 2 (baseline) | `benchmarks/results/phase-2.json` | 1.0 | 0ms | 5-task baseline, mock adapter |
| 3 | `benchmarks/results/phase-3-candidate.json` (gitignored) | 1.0 | mock→mock | 10 Terminal-Bench tasks; Harbor fallback mode (no Harbor/credentials in env); gate PASS vs phase-2 baseline; real Harbor eval deferred until credentials exist |
| 4 | `benchmarks/results/phase-4-candidate.json` (gitignored) | 1.0 | mock→mock | Internal OQS evaluation on synthetic two-agent task; composite 0.713; gate PASS vs phase-3 baseline |
| 5 | `benchmarks/results/phase-5-candidate.json` (gitignored) | 1.0 | mock→mock | Internal OQS evaluation (Phase 4 baseline); self-improvement loop components; gate PASS vs phase-4 baseline |
| 6 | `benchmarks/results/phase-6.json` | 1.0 | mock→mock | MAFBench specialization/overhead modules; internal OQS composite 0.697; gate PASS vs phase-5 baseline |
| 7 | `benchmarks/results/phase-7.json` | 1.0 | $0.0123 | v1.0 gate closure: internal OQS composite 0.860 (≥0.7), RigorBench baseline 1.000, self-improvement 3/4 accepted (≥3), capability isolation deny smoke (controlDenied/benignPassed/floorPort 4321), Terminal-Bench not_observed; gate PASS vs phase-6 baseline |

## Releases

| Version | Trigger | develop→main PR | Date |
|---|---|---|---|
| v0.1.0 | After M12 (npm publish) | — | — |
| v1.0.0 | After Phase 7 | — | — |

## Change Log

> Append-only. One line per meaningful state transition. Don't rewrite history here.

- 2026-09-18 — bootstrapped repository and audited Phase 0 foundation scaffold (PASS: lint, dep-check, typecheck, 3/3 tests)
- 2026-09-18 — completed Phase 1 contracts & types (PASS: lint, dep-check, typecheck, 3/3 tests; contracts zero-import verified)
- 2026-09-18 — integrated HARNESS_INSPIRATIONS accepted items on branch chore/harness-inspirations (PASS: lint, dep-check, typecheck, 3/3 tests)
- 2026-09-18 — started phase 2 on phase/2-adapter-kernel
- 2026-09-18 — Phase 2 gate PASS (lint, dep-check, typecheck, 37/38 tests, benchmark baseline established), merged via PR #2
- 2026-09-18 — started phase 3 on phase/3-tools-verification-context-trace
- 2026-09-18 — Phase 3 local gate PASS (lint, dep-check, typecheck, 104/105 tests): ToolPort+adapters+registry, ShellCommandVerifier (A3 not_observed), FilesystemContextAdapter, JsonlTraceSink + trace show/list (A12), PolicyToolDecorator (A1 fail-closed, A2 runtime floor, A4 default matrix, A9 grants), TraceModelProviderDecorator, stop-condition termination (A6), read→edit→run CLI integration; benchmark fallback mode (no Harbor credentials in env) — impl + gate green, pending verifier report & GitHub CI before merge
- 2026-09-18 — Phase 3 merged via PR #3 (squash 5ab6a78). GitHub CI green on remote: `test` PASS (the one CI test-failure — git `master` vs `main` default branch — fixed by pinning `git init -b main`); `benchmark-gate` PASS (label `phase:3`, Harbor-in-CI bootstrap, compare vs phase-2 baseline). Verifier report was PASS. develop == 5ab6a78.
- 2026-09-18 — started phase 4 on phase/4-agent-oqs
- 2026-09-18 — Phase 4 local gate PASS (lint, dep-check, typecheck, 137/138 tests): SubAgentRouter heuristic (scout-then-act), two-agent loop (developer→reviewer with AgentMessage handoff, A7 blocking/non-blocking findings gate), fileOwnership ToolPort decorator (A10), Internal OQS scorer (5 dimensions: Plan Quality, Assignment Quality, Coordination, Deliverable Quality, Efficiency), DriftReport trace projection (A8); benchmark internal OQS runner with composite 0.713, gate PASS vs phase-3 baseline
- 2026-09-18 — Phase 4 merged via PR #4 (squash 358662f). GitHub CI green on remote: `test` PASS (137/138 tests); `benchmark-gate` PASS (internal OQS composite 0.713, label `phase:4`, compare vs phase-3 baseline). Verifier report was PASS. develop == 358662f.
- 2026-09-18 — started phase 5 on phase/5-npm-self-improvement
- 2026-09-19 — Phase 5 progress: npm publication infrastructure complete (package.json updates, build scripts, .npmignore for all packages, build outputs to dist/); AdapterConformance CLI complete (`forge conformance` table + JSON, 10 adapters across 5 ports); all gate checks pass (lint, dep-check, typecheck, 146/148 tests)
- 2026-09-19 — Phase 5 local gate PASS (lint, dep-check, typecheck, 146/148 tests): npm publication infra (A11); AdapterConformance CLI (`forge conformance`); Weakness Miner (`forge mine`); Bounded Proposals (`forge propose`); Regression Validator (`forge validate`); Self-Improvement Loop (`forge improve`); benchmark internal OQS runner with composite 0.713, gate PASS vs phase-4 baseline
- 2026-09-19 — Phase 5 merged via PR #5 (squash f5d8f64). GitHub CI green on remote: `test` PASS; `benchmark-gate` PASS (internal OQS composite 0.713, label `phase:5`, compare vs phase-4 baseline). Verifier report was PASS. develop == f5d8f64.
- 2026-09-19 — Phase 5 follow-up fix via PR #6 (squash 1a93127). Fixed missing @forge/adapters exports (SelfImprovementOptions, TaskSpec, runSelfImprovementLoop, etc.) and updated phase-4 benchmark baseline to match current OQS runner performance (latency 0.002s). GitHub CI green on remote: `test` PASS; `benchmark-gate` PASS (latency 0.002s → 0.001s, no regression).
- 2026-09-19 — started phase 6 on phase/6-adaptive-orchestration
- 2026-09-19 — Phase 6 local gate PASS (lint, dep-check, typecheck, 146/148 tests): Complexity classifier (LOW/MEDIUM/HIGH), adaptive orchestration graph (LOW/MEDIUM/HIGH), workflow presets (disciplined-v1), model router (capability/cost/latency), MAFBench runner; benchmark internal OQS composite 0.697, gate PASS vs phase-5 baseline
- 2026-09-19 — Phase 6 merged via PR #8 (squash). GitHub CI green on remote: `test` PASS (146/148 tests); `benchmark-gate` PASS (MAFBench specialization/overhead, internal OQS composite 0.697). Verifier report was PASS. develop == 5acf7f7.
- 2026-09-19 — started phase 7 on phase/7-capability-isolation-v1
- 2026-09-19 — Phase 7 objective review approved: full capability isolation + v1.0 gate scope agreed (SECLOUD decision: CONTROL_PLANE_FLOOR in core, union-over-floor non-overridability, outermost isolation decorator, no forged control server). Corrections logged: stale "Phases 0–6 only" claims (STATE.md, HARNESS_INSPIRATIONS.md).
- 2026-09-19 — Phase 7 local gate progress: capability isolation in core (floor + resolve + evaluateCapabilityIsolation + CapabilityIsolationToolDecorator: fail-closed exception/timeout/malformed, before-policy ordering, non-overridable empty-surface), adapter env-sourced surface (FORGE_CONTROL_HOSTS/PORT/PATHS), rigor-pillar scorer (5 pillars), cost attribution, RegressionValidator acceptance-bug fixed (checkRegression object truthiness → used .regressed), self-improvement loop wiring fixed (destructured options, proposalsDir); 180/180 tests PASS after clearing stale compiled .js out of packages/*/src (an earlier tsc had emitted into src/, shadowing TS sources at test time). bench:phase 7 runner green (OQS 0.860 ≥ 0.7 gate, RigorBench baseline 1.000, cost $0.0123 explicit-rates, self-improvement 3/4 accepted, isolation deny smoke, Terminal-Bench honest not_observed); benchmark-gate compare vs phase-6.json PASSES (p50 0.0000342s measured at ns precision — Date.now() was inflating it).
- 2026-09-19 — Phase 7 local gate re-run (nothing changed since prior line except docs/CLI wiring + tsconfig fix): adapters/tsconfig.json path override to sibling dists + ../core reference (rootDir/project-file-list errors when value-importing @forge/core from source), loop.ts missing TaskSpec import; CLI composition root now wraps toolPort in createCapabilityIsolationDecorator (outermost, per PRD §5). Full gate re-run GREEN: lint PASS, dep-check PASS (118 modules, 364 deps, 0 violations), typecheck PASS, test PASS (26 files / 180 passed / 2 skipped), bench:phase 7 PASS (OQS 0.860, rigor 1.000, cost $0.0123, self-improvement 3/4, terminalBench not_observed, isolation smoke deny), compare vs phase-6 PASSES (pass@1 1→1, p50 0.001→0.0000453s, cost 0 baseline skipped). Docs updated: STATE.md (Phases 2–7), PROJECT_OVERVIEW.md §2 control-surface note, HARNESS_INSPIRATIONS.md line 26, benchmark-gate.yml [0-7], bench-phase.mjs guard >7.
- 2026-09-19 — Phase 7 merged via PR #9 (squash 7fd0946). GitHub CI green on remote: `test` PASS; `benchmark-gate` PASS (label `phase:7`, OQS composite 0.860 ≥ 0.7 gate, rigor 1.000, cost $0.0123, self-improvement 3/4, Terminal-Bench not_observed — harbor binary present but FORGE_HARBOR_CONFIG unset; compare vs phase-6 baseline no regression). Verifier report was PASS. develop == 7fd0946. All 7 phases of the roadmap merged; the v1.0.0 release point (M14+, PRD §11) has been reached — `/release` (develop→main) still requires explicit human confirmation per AGENTS.md §8.
