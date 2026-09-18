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

### Tests
- Contract tests: Claude adapter passes same behavioral tests as mock adapter
- Integration test: `forge run "list the files in src/"` produces valid `ModelResponse`
- **Import boundary test:** orchestrator module does not import `@anthropic-ai/sdk`

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
- `PolicyPort` as **decorator around `ToolPort`** (auto/confirm/deny risk tiers). Same pattern.

### Tests
- Contract tests for each tool adapter
- Integration test: task requiring read file → edit → run test
- **Context test:** `ContextPort` returns a pack within the configured token budget and includes files touched by the task's stated inputs
- **Decoration test:** adding trace decorator does not change orchestrator behavior (same outputs, same decisions)
- **Policy test:** `DENY` decision blocks tool execution

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
- `SubAgentRouter` port with heuristic scout-then-act strategy (no LLM classifier yet)
- **Internal orchestration scorer**: Plan Quality, Assignment Quality, Coordination, Deliverable Quality, Efficiency per run. Store in trace.

### Tests
- Integration test: two-agent handoff produces reviewer finding that developer can repair
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
- Publish `@forge/cli` to npm (real usage before ambitious layer)
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
- **Model router**: route models based on task capability, cost/latency budget, context size — not user configuration.

### Tests
- **Classification test:** rename classified LOW, payment feature classified HIGH
- **Graph generation test:** HIGH task graph includes security analysis and adversarial review
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

## Cross-Phase: What You Should NOT Build

- ❌ Your own LLM
- ❌ Your own vector database
- ❌ Your own benchmark runner (use Harbor — Python CLI, invoke via subprocess)
- ❌ Your own trace format (use OpenTelemetry + OpenInference)
- ❌ Your own evaluation framework (use `@tally-evals/tally` — **note:** as of Sept 2026 this is a v0.1.0 package with 3 published versions; vet it (or pin and vendor it) before treating it as a stable dependency, same as the other `@scope/package` references throughout this plan — see the package-maturity caveat in `RESEARCH_AND_DISCUSSION.md` Part 4)
- ❌ 20 agents before 2 work
- ❌ Marketplace before one published package
- ❌ Web dashboard before CLI users
