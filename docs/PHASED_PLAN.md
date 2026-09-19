# Forge — Phased Build Plan

> Each phase touches exactly one port or one adapter. None require reopening a previous phase.
> Every phase includes tests and benchmarks where applicable.

---

## Phase 0 — Foundation (No Product Code)

### Goal
Establish guardrails that make every subsequent phase mechanically safe.

### Deliverables
- pnpm monorepo: `packages/contracts`, `packages/core`, `packages/adapters`, `packages/cli`
- `dependency-cruiser` configured and wired into CI
- Vitest configured
- ADR template and `docs/adr/` directory
- README stating the dependency rule explicitly
- Claims-test pattern for machine-verifying README assertions against repository state (A13)

### The Dependency Rule (Enforced Mechanically)
```
core → contracts (allowed)
adapters → contracts (allowed)
adapters → core (allowed, read-only)
core → adapters (FORBIDDEN)
core → external SDKs (FORBIDDEN)
```

**Tool:** `dependency-cruiser` statically analyses TypeScript import graphs to enforce architectural rules and catch dependency violations before they reach production.

### Tests
- CI fails if a core file imports from adapters
- CI fails if a core file imports an external SDK
- `pnpm test` runs (even if zero tests)
- **Claims-test:** verify README assertions against actual package exports and configs

### Benchmark
None. Nothing to benchmark.

### References
- `dependency-cruiser` — architecture enforcement
- `eslint-plugin-boundaries` — complementary boundary linting
- Hexagonal architecture: core never imports adapters

---

## Phase 1 — Contracts & Types (Single Source of Truth)

### Goal
Define every port and domain type **before** any implementation exists.

### Deliverables (`packages/contracts`)
```typescript
// Ports
ModelProvider    — complete(input: ModelRequest): Promise<ModelResponse>
ToolPort         — execute(tool: ToolCall, ctx: ToolContext): Promise<ToolResult>
VerificationPort — verify(task: Task, output: unknown): Promise<VerificationResult>
ContextPort      — build(task: Task, repo: RepoState): Promise<ContextPack>
TracePort        — record(event: TraceEvent): void
PolicyPort       — evaluate(action: ActionRequest): Promise<PolicyDecision>
SubAgentRouter   — route(task: Task, agents: AgentSpec[]): Promise<AgentSelection>

// Domain Types
Task, AgentMessage, VerificationResult, ContextPack, TraceEvent, PolicyDecision
```

### Critical Rule
`packages/contracts` has **zero dependencies**. No executable code. Pure TypeScript types and interfaces.

**Reference:** `@mnemo-ai/types` — a pure type boundary package with zero runtime deps that serves as the single source of truth for adapter implementers.

### Tests
- Type-level tests: `tsd` or `expect-type` to verify adapter implementers must satisfy port contracts
- Contract test suite for each port: fixed behavioral tests any adapter must pass
- Run contract tests against a **mock adapter** first

### Benchmark
None. Correctness of contracts, not performance.

### References
- `@mnemo-ai/types` — pure type boundary pattern
- `@a-dray/aglib` — "four seams with adapters: model, store, sandbox, harness" with conformance suites

---

## Phase 2 — First Adapter + Execution Kernel

### Goal
Build one real adapter against one port, prove the dependency rule holds.

### Deliverables
- `packages/adapters/model-claude`: implements `ModelProvider` using Claude Agent SDK
- Contract tests for `ModelProvider` run against Claude adapter
- `packages/core/orchestrator`: single-agent loop depending only on `ModelProvider` (injected)
- CLI command: `forge run "task"` wiring adapter into orchestrator
- `AdapterConformance` declaration (A11): adapter states enforced vs unenforced guarantees and limitations, surfaced by CLI

### Tests
- Contract tests: Claude adapter passes same behavioral tests as mock adapter
- Integration test: `forge run "list the files in src/"` produces valid `ModelResponse`
- **Import boundary test:** orchestrator module does not import `@anthropic-ai/sdk`
- **Adapter conformance test:** verify adapter returns valid `AdapterConformance` structure

### Benchmark
- Run 5 simple tasks through CLI. Record token usage, latency, success rate. **This is your baseline.**

### References
- `@arasandev/harness` — clean-room TypeScript agent harness; vendor-neutral composable kernel; implements loop, tool execution, permission gating, hooks, subagent delegation, compaction, transcript persistence as typed library
- `polyglot-agent-harness` — deliberately separates re-entrant agent kernel from model providers, repository intelligence, policies, sandboxes, tools, language/framework plugins

---

## Phase 3 — Tools, Verification, Context, and Trace Decorator

### Goal
Add the ports that make Forge a harness, not just a model wrapper. Add tracing **without touching the orchestrator**.

### Deliverables
- `ToolPort` + `filesystem`, `shell`, `git`, `search` adapters (with contract tests)
- `VerificationPort` + shell-command adapter (build/test/lint runner). Wire "no self-declared done" gate.
- `ContextPort` + filesystem-schema adapter: assembles a task-specific `ContextPack` (relevant files, symbols, git history, rules) from repo state. **Correction:** this port was defined as a contract in Phase 1 but had no owning phase in the original plan (it's milestone M7 in `PRD.md`) — it belongs here, alongside the other adapters that make the harness usable end to end.
- `TracePort` as **decorator around `ModelProvider`** (POLAR pattern) + JSONL adapter. **Must not touch orchestrator.** Wraps an existing port.
- Human-readable trace summary command: `forge trace show <run-id>` alongside JSONL sink (A12)
- `PolicyPort` as **decorator around `ToolPort`** (auto/confirm/deny risk tiers):
  - **Fail-closed evaluation (A1):** any evaluation failure (exception, timeout, malformed `PolicyDecision`, unreachable policy process) MUST resolve to `deny`. Never `allow`.
  - `RUNTIME_FLOOR` (A2): non-overridable deny list compiled in core, evaluated *before* configurable rule engine, not loadable/overridable from `forge.yaml`.
  - **Default rule set (A4):** modeled on CCH matrix (deny verification bypass `git commit --no-verify`/`-n`, destructive reset on protected branches, force push, secrets in diffs; warn on protected-file edits `package.json`/workflows/`Dockerfile`; strict deny for `.env` and key material).
  - `PolicyGrant` (A9): scoped, plan-time approval mechanism allowing temporary scoped permissions without weakening `RUNTIME_FLOOR`.
- `VerificationResult` handling (A3 & A5): support `not_observed` status (must never count as pass, nor silently render as fail) and `ReadinessLevel` (`draft` | `pr-ready` | `release-ready`).
- `StopCondition` enforcement (A6): `Task.stopConditions` checked in orchestrator retry path before every retry attempt.

### Tests
- Contract tests for each tool adapter
- Integration test: task requiring read file → edit → run test
- **Context test:** `ContextPort` returns a pack within the configured token budget and includes files touched by the task's stated inputs
- **Decoration test:** adding trace decorator does not change orchestrator behavior (same outputs, same decisions)
- **Policy test:** `DENY` decision blocks tool execution
- **Fail-closed policy test (A1, non-negotiable):** inject exception, timeout, and malformed `PolicyDecision`, and assert in each case that the underlying tool **never executed**
- **Runtime floor test (A2):** verify that a `forge.yaml` attempting to permit a floor-denied action still results in `deny`
- **Default policy matrix test (A4):** verify secrets, verification bypass, and destructive resets trigger deny/warn as specified
- **`not_observed` status test (A3):** verify `not_observed` status is neither counted as pass nor rendered silently as failure
- **Stop condition retry test (A6):** verify retry path terminates immediately when a `StopCondition` threshold is reached
- **Policy grant test (A9):** verify valid `PolicyGrant` allows targeted action while expired/unmatched grant denies execution

### Benchmark
- Run 10 Terminal-Bench tasks through `forge run` using Harbor. Record pass@1, token usage, latency, cost. Compare to Phase 2 baseline.

### References
- **Harbor** — official harness for Terminal-Bench 2.0, from Terminal-Bench creators. Evaluates arbitrary agents like Claude Code, OpenHands, Codex CLI. Supports cloud providers (Daytona, Modal, LangSmith, Blaxel, Novita Sandbox). Records tokens, cost, duration, reward. **Correction:** Harbor is a **Python CLI** (`pip install harbor` / `uv tool install harbor`), not an npm package — the `benchmarks/terminal-bench/run.ts` file in `PROJECT_OVERVIEW.md` should shell out to the `harbor` executable as a subprocess and parse its output, not import it as a TypeScript dependency.
- **POLAR** — proxy at model-API call boundary, not harness internals. Tracing doesn't have to touch orchestrator.
- `@a-dray/aglib` — session log as state, not record; loop re-projects context from committed entries every turn

---

## Phase 4 — Second Agent + Orchestration Quality Measurement

### Goal
Add a second declarative agent (reviewer) and measure orchestration quality, not just outcomes.

### Deliverables
- `AgentMessage` handoff between exactly two agents (developer → reviewer)
- Blocking findings gate DONE (A7): `ReviewResult` distinguishes `blockingFindings` from `nonBlockingFindings`; only blocking findings prevent DONE state.
- `fileOwnership` enforcement (A10): `AgentSpec.fileOwnership` enforced in `ToolPort` decorator to ensure multi-agent executions are structurally conflict-free.
- `SubAgentRouter` port with heuristic scout-then-act strategy (no LLM classifier yet)
- **Internal orchestration scorer**: Plan Quality, Assignment Quality, Coordination, Deliverable Quality, Efficiency per run. Store in trace.
- `DriftReport` as trace projection (A8): `DriftReport` + `DriftType` computed as a projection over trace events (not a separate store), and wired into internal OQS scorer's Coordination dimension as a judge-free, computable orchestration signal (answering open question in `PRD.md` §12).

### Tests
- Integration test: two-agent handoff produces reviewer finding that developer can repair
- **Review findings gate test (A7):** non-blocking findings allow DONE state, while blocking findings prevent completion
- **File ownership isolation test (A10):** `ToolPort` decorator denies file modification outside agent's declared `fileOwnership`
- **Drift report trace projection test (A8):** verify `DriftReport` computes accurately from trace events and feeds Coordination dimension in OQS
- **Orchestration scorer test:** verify scorer correctly identifies known-good plan vs. known-bad plan
- Regression test: reviewer agent cannot modify files (permission enforcement)

### Benchmark
- **MAFBench** — unified benchmark for architectural design choices in LLM-based frameworks across orchestration, memory, planning, specialization, coordination. Isolates framework-level effects from model capabilities.
- **OrchestrationBench** — bilingual (English/Korean) benchmark evaluating workflow-based planning and constraint-aware tool execution across 17 domains with ~100 virtual tools.
- **Internal OQS (Orchestration Quality Score)** — the five-dimension scorer built above (Plan Quality, Assignment Quality, Coordination, Deliverable Quality, Efficiency). **Correction:** previously labeled "EPOB" and presented as a fourth external benchmark alongside MAFBench/OrchestrationBench/RigorBench — no published benchmark by that name could be verified, so this is scoped as Forge's own instrumentation (which matches how this same phase already describes it above, under Deliverables) rather than an adopted external standard. Exposes failure modes in planning, delegation, handoff, review, recovery that outcome-only evaluation does not reveal.
- **RigorBench** — five pillars: Planning Fidelity, Verification Coverage, Recovery Efficiency, Abstention Quality, Atomic Transition Integrity. Structured process discipline improves process quality by 41% and outcome correctness by 17% — **treat this figure as directional, not settled**: the paper discloses a conflict of interest (its authors co-developed one of the frameworks it benchmarks), and an independent review found the specific 41%/17% numbers insufficiently justified by the underlying pillars/tasks. See `RESEARCH_AND_DISCUSSION.md` Part 3 for the full caveat.

### References
- `@mrburnz/bonefish` — YAML-defined multi-agent orchestrator with checkpointing, tracing, gates, cycles, cost guardrails. Dry-run mode spends zero tokens.
- `crossagents-runtime` — provider-agnostic, model-adaptive runtime with pattern selector that filters by task requirements, model capabilities, policy, then scores survivors.
- `AgentOS` — TypeScript runtime with six orchestration strategies (adaptive, graph, hierarchical, debate). **Correction:** no npm package was found under this exact literal name — confirm the real package identifier (it may be scoped, e.g. `@something/agentos`, or hosted outside npm) before adding it to `package.json`.

---

## Phase 5 — npm Publication + Self-Improvement Loop

### Goal
Ship v0.1, gather real traces, close the loop.

### Deliverables
- Publish `@runforge/cli` to npm (real usage before ambitious layer)
- Surface `AdapterConformance` across published CLI adapters (A11)
- **Weakness mining** script: analyze failure traces to identify reusable failure mechanisms. Cluster by mechanism: missing final artifact, repeated invalid command, no recovery after tool error, exploration without implementation.
- **Bounded proposal** system: define editable surface (system prompt, tool selection rules, verification middleware, recovery policy). Each proposal states behavior changed and regression risk.
- **Regression validation**: candidate harness re-runs against held-in and held-out splits. Accept only if at least one improves without the other regressing.

### Tests
- **Self-improvement loop test:** known-bad harness configuration correctly rejected by regression validation
- **Trace completeness test:** every required trace event recorded (context selected, model decision, tool call, tool result, state transition, agent message, verification result, final outcome)
- **Cost attribution test:** token usage and cost correctly attributed to each agent and phase

### Benchmark
- Run Terminal-Bench again. Compare pass@1 and cost to Phase 4.
- Run **full internal OQS five-dimension evaluation**.
- Publish benchmark methodology (model, harness version, prompt version, tools, context strategy, agent strategy, sandbox, retry policy, verification policy, token usage, time, cost).

### References
- **Self-Harness** (Zhang et al., "Self-Harness: Harnesses That Improve Themselves," arXiv:2606.09498) — model weights and evaluator fixed; each round evaluates current harness, mines failure patterns from traces, asks same model to propose bounded harness edits, promotes candidate only when held-in and held-out regression checks support the change. **Correction:** the original reference cited a "Haiku: 18 → 23 of 28 issues resolved (64% → 82%)" result that does not appear in the paper. The paper instantiates Self-Harness on Terminal-Bench 2.0, SWE-bench Verified, and AppWorld using MiniMax M2.5, Qwen3.5-35B-A3B, and GLM-5 as base models (not Claude Haiku), reporting relative gains of up to 132% across all nine model–benchmark combinations. Use the paper's actual reported numbers if you cite a specific figure.
- **HALO** (context-labs) — OpenTelemetry-compatible traces → HALO-RLM engine → decomposes traces to understand common failure modes → report fed into coding agent → changes applied → harness redeployed → repeat. AppWorld: 73.7 → 89.5.
- **ACE** (Agentic Context Engineering) — Generator records trajectories, Reflector extracts insights, Curator manages learnings with deduplication/pruning, Manager injects relevant strategies. Learnings stored in human-readable markdown with helpful/harmful counters.
- `@agntk/agent-harness` — session capture → journal synthesis → rule proposal → auto-install → behavior change.

---

## Phase 6 — Adaptive Orchestration (The Differentiator)

### Goal
Replace heuristic routing with complexity-aware dynamic graph generation.

### Deliverables
- **Complexity classifier**: classify tasks as LOW/MEDIUM/HIGH based on signals (number of files, security sensitivity, database changes, API changes, unknowns)
- **Dynamic orchestration graph**: generate agent topology from complexity classification.
  - Small task → single agent
  - Medium task → explorer → planner → developer → tester
  - Complex task → research → architecture → security → parallel implementation → integration tests → adversarial review → repair → verification
- **Workflow Presets:** support `disciplined-v1` preset (Investigate → Plan → Work → Review → PR → Release pipeline) selectable in `forge.yaml` alongside `adaptive` — provided as an opt-in preset, not a mandatory core pipeline.
- **Model router**: route models based on task capability, cost/latency budget, context size — not user configuration.

### Tests
- **Classification test:** rename classified LOW, payment feature classified HIGH
- **Graph generation test:** HIGH task graph includes security analysis and adversarial review
- **Workflow preset test:** selecting `disciplined-v1` in `forge.yaml` executes strict 6-stage pipeline
- **Model routing test:** classification task routes to cheap/fast model; architecture task routes to reasoning model

### Benchmark
- Run MAFBench **specialization** and **framework overhead** modules. Compare adaptive routing to fixed pipelines.
- Measure **orchestration cost** as first-class metric alongside success rate.
- **ClawArena-Team** — 41 multi-turn, multimodal, multi-directory scenarios, 258 evaluation rounds, 72 staged updates. Measures management ability: leader LLM creates specialized subagents, delegates work, orchestrates parallel returns. Key finding: management bottleneck is **privilege granting, not perception**.

### References
- `@clearideas/agent-runtime` — dependency-aware graph execution: resolves manifest variable reads and outputs into dependency-aware execution plan; parallel mode schedules eligible independent prompt branches; preserves deterministic orchestration while reducing elapsed time.
- `AgentOS` — six orchestration strategies (adaptive, graph, hierarchical, debate). *(See package-name caveat in Phase 4 references above.)*
- `crossagents-runtime` — pattern selector scores survivors by task requirements, model capabilities, policy.

---

## Phase 7 — Capability Isolation + v1.0 Gate Completion

> **Scope note:** This phase is an **addition to the original roadmap**, which ended at
> Phase 6 (release of `v1.0.0`). It exists because two promises from `PRD.md` are
> still unmet after Phase 6: the §5 core principle **capability isolation** (the
> agent execution environment must not reach the harness control plane) was never
> delivered as a runtime feature, and the v1.0 success metrics in §10 are not yet
> all closed (internal OQS composite 0.697 < 0.7 target; RigorBench unmeasured;
> real Terminal-Bench eval deferred; self-improvement loop not run end-to-end to ≥ 3
> accepted edits). The release point for `v1.0.0` moves from "after Phase 6" to
> "after Phase 7" accordingly (see `AGENTS.md` §5 and `docs/PRD.md` §11).

### Goal
Deliver capability isolation (the last undeployed §5 core principle) and close the
remaining v1.0 success-metric gates so the release point after this phase can be a
defensible `v1.0.0`.

### Deliverables
- **Capability isolation**: agent execution environment must not have network access
  to the harness control interface. Control plane and data plane separated at the
  network level, not just the policy level (`RESEARCH_AND_DISCUSSION.md` Part 3,
  Flaw 3 — the CVE-2026-82533 trust-boundary lesson: policy tiers alone are
  insufficient if a spoofed `Host` header can reach the control API).
  - Enforced in `packages/core` as a runtime boundary (non-overridable via
    `forge.yaml`, same tier as the A2 `RUNTIME_FLOOR`), evaluated **before** the
    configurable policy engines, fail-closed on any evaluation failure.
- **v1.0 gate closure**:
  - Internal OQS composite ≥ 0.7 on the standard synthetic evaluation (Phase 6
    measured 0.697 on the same runner).
  - RigorBench process-discipline baseline **measured** (Planning Fidelity,
    Verification Coverage, Recovery Efficiency, Abstention Quality, Atomic
    Transition Integrity) so the v1.0 "≥ 41% improvement" target has a number to
    improve against — treat the 41%/17% figure as directional, not settled
    (caveat in Phase 4 / `RESEARCH_AND_DISCUSSION.md` Part 3).
  - Cost per verified task measured vs. the Phase 2 baseline (target ≤ 50%).
  - Self-improvement loop: ≥ 3 harness edits accepted through the existing
    hold-in/hold-out regression validator (Self-Harness discipline, Phase 5).
  - Terminal-Bench 2.0 eval: real Harbor run if credentials exist in the
    environment; otherwise fallback mode recorded honestly as `not_observed`,
    never reported as a pass (`AGENTS.md` §11).

### Tests
- **Capability isolation test:** a tool/model execution attempt to reach the harness
  control interface is denied at the network boundary — never reaches the control
  plane.
- **Fail-closed isolation test (non-negotiable):** inject exception, timeout, and
  malformed boundary-evaluation outcomes, and assert each results in **denial** and
  the control plane is never touched.
- **Non-overridability test:** `forge.yaml` attempting to disable or weaken the
  isolation boundary still results in enforcement (mirrors A2 floor behavior).
- **OQS threshold test:** known-good vs. known-bad runs score as expected and the
  standard composite evaluates ≥ 0.7.
- **RigorBench projection test:** trace-projected pillar scores computed correctly
  on a synthetic trace (same projection pattern as A8 `DriftReport`).
- **Self-improvement acceptance test:** only edits passing hold-in/hold-out
  regression validation are accepted; ≥ 3 accepted edits are recorded.
- **Cost attribution test:** cost per verified task attributed per agent and phase,
  compared against the Phase 2 baseline.

### Benchmark
- Internal OQS composite ≥ 0.7 on the Phase 6 synthetic evaluation — no regression
  vs. the Phase 6 baseline stored in `benchmarks/results/phase-6.json`.
- RigorBench pillar baseline (first measurement — this phase establishes the
  baseline; the 41% improvement is graded at a later release point against it).
- Cost per verified task vs. Phase 2 baseline (target ≤ 50%).
- Terminal-Bench 2.0 via Harbor (Python CLI, subprocess) if credentials exist;
  otherwise fallback mode + explicitly `not_observed` in the gate result.

### References
- `RESEARCH_AND_DISCUSSION.md` Part 3 (Flaw 3) — CVE-2026-82533 trust-boundary
  analysis motivating the network-level isolation layer.
- `docs/PHASED_PLAN.md` Phase 4 — RigorBench (with caveat), internal OQS.
- `docs/PHASED_PLAN.md` Phase 3 — Harbor correction (Python CLI, subprocess).
- `docs/PHASED_PLAN.md` Phase 5 — Self-Harness hold-in/hold-out promotion
  discipline (corrected figures).
- `docs/PRD.md` §5 (capability isolation principle), §10 (v1.0 success metrics),
  §11 (release point after Phase 7).

---

## Cross-Phase: What You Should NOT Build

- ❌ Your own LLM
- ❌ Your own vector database
- ❌ Your own benchmark runner (use Harbor — Python CLI, invoke via subprocess)
- ❌ Your own trace format (use OpenTelemetry + OpenInference)
- ❌ Your own evaluation framework (use `@tally-evals/tally` — **note:** as of Sept 2026 this is a v0.1.0 package with 3 published versions; vet it (or pin and vendor it) before treating it as a stable dependency, same as the other `@scope/package` references throughout this plan — see the package-maturity caveat in `RESEARCH_AND_DISCUSSION.md` Part 4)
- ❌ 20 agents before 2 work
- ❌ Marketplace before one published package
- ❌ Web dashboard before CLI users
