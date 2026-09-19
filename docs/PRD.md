# Forge — Product Requirements Document

## 1. Product Identity

| Field | Value |
|---|---|
| **Name** | Forge |
| **Tagline** | The runtime you use to build and run your own coding agents |
| **Category** | Agent orchestration runtime |
| **Distribution** | npm (`@forge/cli`, `@forge/core`, `@forge/contracts`) |
| **License** | Apache 2.0 |
| **Primary interface** | CLI + TypeScript SDK |
| **Secondary interface** | Programmatic API, npm plugin ecosystem |

## 2. Problem Statement

- Coding agents exist (Claude Code, Codex, OpenCode, Aider) but are **closed harnesses** — you use their agent, not your own.
- Orchestration logic is buried inside proprietary runtimes. You cannot measure, replace, or improve it.
- Harness design moves benchmark scores by 22+ points while model swaps move them by 1 — yet harnesses are the least accessible layer.
- No runtime treats **orchestration quality** as a measurable, optimizable quantity.
- Security incidents affect 87% of teams; policy is prompt-based, not runtime-enforced.

## 3. Product Thesis

> Forge is a model-agnostic agent orchestration runtime for software development that lets developers compose specialized agents, tools, policies, and verification workflows from a CLI or SDK.

**Core differentiation:** orchestration quality as a measured, optimizable quantity — not "more agents."

## 4. Target Users

| Persona | Need | Forge Value |
|---|---|---|
| Solo developer | Wants Claude Code-like UX but control over internals | Default agent works out of box; every layer replaceable |
| Platform engineer | Needs to standardize agent behavior across teams | npm-distributed agents, tools, workflows, policies |
| AI researcher | Needs reproducible orchestration experiments | Trace store, orchestration quality metrics, benchmark harness |
| Tool vendor | Wants to distribute a capability | npm package implements a port |

## 5. Core Architecture Principles

- **Ports & adapters (hexagonal)** — core has zero external imports; adapters implement ports
- **Trace-first** — every model call, tool call, state transition, verification result recorded from day one
- **Evidence-based completion** — runtime determines success, not the LLM
- **Policy-native** — permissions enforced at runtime, not in prompts
- **Fail-closed policy enforcement** — any policy evaluation failure (exception, timeout, malformed decision) MUST resolve to `deny`, never `allow`
- **Non-overridable runtime floor** — security deny floor compiled into core, evaluated before user/project policy engines and impossible to override via `forge.yaml`
- **npm-native extensibility** — agents, tools, workflows, policies are composable packages
- **Capability isolation** — agent execution environment cannot reach the harness control plane

## 6. Ports (Contracts)

| Port | Purpose | First Adapter |
|---|---|---|
| `ModelProvider` | LLM inference | Claude Agent SDK |
| `ToolPort` | File, shell, git, search execution | filesystem, shell, git, ripgrep |
| `VerificationPort` | Build/test/lint gates | shell-command runner |
| `ContextPort` | Task-specific context assembly | schema-checked file system |
| `TracePort` | Execution trace recording | OpenTelemetry + JSONL |
| `PolicyPort` | Action risk classification | auto/confirm/deny tiers |
| `SubAgentRouter` | Delegation decisions | heuristic scout-then-act |

## 7. Core Domain Types

```
Task              — objective, inputs, success criteria, retry policy
AgentMessage      — structured inter-agent communication
VerificationResult — evidence-based completion gate
ContextPack       — task-specific repository context
TraceEvent        — observable execution record
PolicyDecision    — allow/approve/deny with rationale
```

## 8. Differentiators (Ranked)

1. **Adaptive orchestration** — task complexity → dynamically generated workflow graph
2. **Context engineering** — task → repository graph → relevant 2% of repo
3. **Evidence-based completion** — tests + analysis + review → done
4. **Intelligent model routing** — capability × cost × latency → model selection
5. **Policy-native agents** — every action through runtime-enforced policy
6. **Self-improving loop** — trajectory mining → bounded harness edits → regression validation

## 9. Non-Goals (v1)

- ❌ Own LLM or vector database
- ❌ Own benchmark runner (use Harbor — a Python CLI, invoked via subprocess, not an npm package)
- ❌ Own trace format (use OpenTelemetry)
- ❌ Desktop app, web dashboard, custom IDE
- ❌ 20 agents before 2 work
- ❌ Marketplace before one published package

## 10. Success Metrics

| Metric | Target (v0.1) | Target (v1.0) |
|---|---|---|
| Terminal-Bench 2.0 pass@1 | ≥ baseline | Top 10 harness |
| Orchestration quality (internal OQS, 5-dim) | Measured | ≥ 0.7 composite |
| Process discipline (RigorBench) | Measured | ≥ 41% improvement |
| Cost per verified task | Baseline | ≤ 50% of baseline |
| npm install success rate | 100% | 100% |
| Self-improvement loop cycles | — | ≥ 3 accepted edits |

## 11. Milestones

> This table is the milestone-level view of the single roadmap; `PHASED_PLAN.md` is the phase-level view of the same roadmap. The **Phase** column below is the cross-reference between the two — treat `PHASED_PLAN.md` as the source of truth for deliverables/tests/benchmarks per phase, and this table as the sequencing/gating view. Do not edit one without updating the other.

| Milestone | Phase | Deliverable | Gate |
|---|---|---|---|
| M0 | Phase 0 | Repo scaffold + lint rules | CI enforces dependency rule |
| M1 | Phase 1 | Core domain types | Zero logic, zero imports |
| M2 | Phase 1 | `ModelProvider` port + contract tests | Mock adapter passes |
| M3 | Phase 2 | Claude adapter | Real adapter passes contract tests |
| M4 | Phase 2 | Single-agent loop + CLI | `forge run "task"` works |
| M5 | Phase 3 | `ToolPort` + adapters | File/shell/git tools work |
| M6 | Phase 3 | `VerificationPort` | "No self-declared done" gate active |
| M7 | Phase 3 | `ContextPort` | Task-specific context pack generated |
| M8 | Phase 3 | `TracePort` decorator | Traces recorded without touching orchestrator |
| M9 | Phase 3 | `PolicyPort` decorator | DENY blocks execution |
| M10 | Phase 4 | Second agent (reviewer) | Two-agent handoff works |
| M11 | Phase 4 | `SubAgentRouter` | Heuristic routing works |
| M12 | Phase 5 | npm publish v0.1 | Real usage |
| M13+ | Phase 6 | Adaptive orchestration + self-improvement | Internal OQS + Terminal-Bench measured |
| M14+ | Phase 7 | Capability isolation + v1.0 gate closure | Isolation enforced; OQS ≥ 0.7; v1.0 release point reached |

**Correction note:** `ContextPort` (M7) previously had no corresponding deliverable in `PHASED_PLAN.md` Phase 3 — the phase's original scope covered `ToolPort`, `VerificationPort`, `TracePort`, and `PolicyPort` only. `PHASED_PLAN.md` has been updated to include `ContextPort` in Phase 3 so every milestone now maps to a phase deliverable.

**Extension note:** Phase 7 is an addition to the original 0–6 roadmap. The original plan gated `v1.0.0` to "after Phase 6"; with Phase 7 the release point moves to "after Phase 7", because the §5 capability-isolation principle and several §10 v1.0 metrics were still unmet after Phase 6. See `PHASED_PLAN.md` Phase 7 for scope, and `AGENTS.md` §5 / §8 for the release workflow.

## 12. Open Questions

- How to correlate trajectory insights with orchestration decisions (not just tool-call success)?
- What is the minimal editable surface for self-improvement that avoids overfitting?
- How to measure orchestration quality without an LLM judge that itself has harness-dependent variance?
- When does delegation become net-negative (coordination cost > capability gain)?
