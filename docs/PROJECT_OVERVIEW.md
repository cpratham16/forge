# Forge — Project Overview & File Structure

---

## 1. Repository Structure

```
forge/
│
├── package.json                    # pnpm workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .dependency-cruiser.cjs         # Architecture enforcement
├── vitest.config.ts
├── .github/
│   └── workflows/
│       └── ci.yml                  # Runs lint, test, dependency-cruiser, benchmark smoke
│
├── docs/
│   ├── adr/                        # Architecture Decision Records
│   │   ├── 001-ports-and-adapters.md
│   │   ├── 002-trace-first-architecture.md
│   │   ├── 003-evidence-based-completion.md
│   │   ├── 004-capability-isolation.md
│   │   └── TEMPLATE.md
│   ├── PRD.md
│   ├── PHASED_PLAN.md
│   ├── RESEARCH_AND_DISCUSSION.md
│   └── PROJECT_OVERVIEW.md
│
├── packages/
│   │
│   ├── contracts/                  # ZERO dependencies. Pure types + interfaces.
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── ports/
│   │   │   │   ├── model-provider.ts
│   │   │   │   ├── tool-port.ts
│   │   │   │   ├── verification-port.ts
│   │   │   │   ├── context-port.ts
│   │   │   │   ├── trace-port.ts
│   │   │   │   ├── policy-port.ts
│   │   │   │   └── sub-agent-router.ts
│   │   │   ├── domain/
│   │   │   │   ├── task.ts
│   │   │   │   ├── agent-message.ts
│   │   │   │   ├── verification-result.ts
│   │   │   │   ├── context-pack.ts
│   │   │   │   ├── trace-event.ts
│   │   │   │   └── policy-decision.ts
│   │   │   └── errors/
│   │   │       └── index.ts
│   │   └── test/
│   │       └── type-contracts.test-d.ts
│   │
│   ├── core/                       # Domain logic. No external imports.
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── orchestrator/
│   │   │   │   ├── single-agent-loop.ts
│   │   │   │   ├── multi-agent-loop.ts
│   │   │   │   └── graph-executor.ts
│   │   │   ├── context/
│   │   │   │   ├── context-builder.ts
│   │   │   │   ├── relevance-scorer.ts
│   │   │   │   └── pack-assembler.ts
│   │   │   ├── verification/
│   │   │   │   ├── gate-runner.ts
│   │   │   │   ├── evidence-collector.ts
│   │   │   │   └── completion-judge.ts
│   │   │   ├── agents/
│   │   │   │   ├── explorer.ts
│   │   │   │   ├── planner.ts
│   │   │   │   ├── developer.ts
│   │   │   │   ├── tester.ts
│   │   │   │   └── reviewer.ts
│   │   │   ├── routing/
│   │   │   │   ├── complexity-classifier.ts
│   │   │   │   ├── model-router.ts
│   │   │   │   └── sub-agent-router.ts
│   │   │   ├── quality/
│   │   │   │   ├── oqs-scorer.ts
│   │   │   │   ├── rigor-pillar-scorer.ts
│   │   │   │   └── orchestration-metrics.ts
│   │   │   └── self-improvement/
│   │   │       ├── weakness-miner.ts
│   │   │       ├── proposal-generator.ts
│   │   │       └── regression-validator.ts
│   │   └── test/
│   │       ├── orchestrator.test.ts
│   │       ├── context.test.ts
│   │       └── quality-scorer.test.ts
│   │
│   ├── adapters/                   # Concrete implementations of ports.
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── model/
│   │   │   │   ├── claude-agent-sdk.ts
│   │   │   │   ├── openai.ts
│   │   │   │   ├── openrouter.ts
│   │   │   │   └── mock.ts
│   │   │   ├── tools/
│   │   │   │   ├── filesystem.ts
│   │   │   │   ├── shell.ts
│   │   │   │   ├── git.ts
│   │   │   │   ├── ripgrep.ts
│   │   │   │   └── browser.ts
│   │   │   ├── verification/
│   │   │   │   ├── shell-command.ts
│   │   │   │   ├── test-runner.ts
│   │   │   │   └── linter.ts
│   │   │   ├── context/
│   │   │   │   ├── filesystem-schema.ts
│   │   │   │   ├── ast-index.ts
│   │   │   │   ├── lsp-index.ts
│   │   │   │   └── git-history.ts
│   │   │   ├── trace/
│   │   │   │   ├── otel-decorator.ts
│   │   │   │   ├── jsonl-writer.ts
│   │   │   │   └── composite.ts
│   │   │   └── policy/
│   │   │       ├── risk-tier.ts
│   │   │       ├── approval-gate.ts
│   │   │       └── capability-isolation.ts
│   │   └── test/
│   │       ├── model/
│   │       │   └── contract.test.ts
│   │       ├── tools/
│   │       │   └── contract.test.ts
│   │       ├── verification/
│   │       │   └── contract.test.ts
│   │       ├── context/
│   │       │   └── contract.test.ts
│   │       ├── trace/
│   │       │   └── contract.test.ts
│   │       └── policy/
│   │           └── contract.test.ts
│   │
│   └── cli/                        # First consumer of the runtime.
│       ├── package.json
│       ├── src/
│       │   ├── index.ts
│       │   ├── commands/
│       │   │   ├── run.ts
│       │   │   ├── init.ts
│       │   │   ├── agent.ts
│       │   │   ├── workflow.ts
│       │   │   ├── trace.ts
│       │   │   └── bench.ts
│       │   ├── interactive/
│       │   │   ├── repl.ts
│       │   │   └── renderer.ts
│       │   └── config/
│       │       ├── forge-yaml.ts
│       │       └── loader.ts
│       └── test/
│           └── run.test.ts
│
├── benchmarks/
│   ├── terminal-bench/
│   │   └── run.ts                  # shells out to Harbor (Python CLI, via child_process) — not an npm import
│   ├── swe-bench/
│   │   └── run.ts
│   ├── oqs/
│   │   └── scorer.ts               # Five-dimension orchestration quality — Forge's internal scorer, not an adopted external benchmark
│   ├── rigor/
│   │   └── pillar-scorer.ts        # NOTE: RigorBench's published 41%/17% figures are disputed — re-derive on Forge's own tasks (see RESEARCH_AND_DISCUSSION.md Part 3)
│   └── maf/
│       └── run.ts
│
├── examples/
│   ├── add-health-endpoint/
│   ├── fix-auth-bug/
│   └── implement-pagination/
│
└── package.json
```

---

## 2. Port Contract Reference

### `ModelProvider`

```typescript
export interface ModelProvider {
  complete(input: ModelRequest): Promise<ModelResponse>;
}

export interface ModelRequest {
  messages: Message[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  metadata?: Record<string, unknown>;
}

export interface ModelResponse {
  content: string;
  toolCalls?: ToolCall[];
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
}
```

### `ToolPort`

```typescript
export interface ToolPort {
  execute(tool: ToolCall, ctx: ToolContext): Promise<ToolResult>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolContext {
  workspace: string;
  permissions: PolicyDecision;
  signal?: AbortSignal;
}

export interface ToolResult {
  callId: string;
  output: string;
  error?: string;
  metadata?: Record<string, unknown>;
}
```

### `TracePort`

```typescript
export interface TracePort {
  record(event: TraceEvent): void;
  flush(): Promise<void>;
}

export interface TraceEvent {
  id: string;
  parentId?: string;
  timestamp: number;
  type: TraceEventType;
  agent: string;
  payload: Record<string, unknown>;
}

export type TraceEventType =
  | 'context.selected'
  | 'model.request'
  | 'model.response'
  | 'tool.call'
  | 'tool.result'
  | 'state.transition'
  | 'agent.message'
  | 'verification.result'
  | 'orchestration.decision'
  | 'run.outcome';
```

### `PolicyPort`

```typescript
export interface PolicyPort {
  evaluate(action: ActionRequest): Promise<PolicyDecision>;
}

export interface ActionRequest {
  type: 'read' | 'write' | 'execute' | 'network' | 'delete';
  target: string;
  args?: Record<string, unknown>;
  agent: string;
}

export interface PolicyGrant {
  id: string;
  grantee: string;
  actionType: 'read' | 'write' | 'execute' | 'network' | 'delete';
  resourcePattern: string;
  expiresAt?: number;
  approvedBy: string;
  rationale: string;
}

export type PolicyDecision =
  | { outcome: 'allow'; rationale: string }
  | { outcome: 'approve'; rationale: string; approver: string }
  | { outcome: 'deny'; rationale: string };
```

### `SubAgentRouter`

```typescript
export interface AgentSpec {
  name: string;
  capabilities: string[];
  costTier: 'fast' | 'balanced' | 'reasoning';
  fileOwnership: string[];
}
```

### `AdapterConformance`

```typescript
export interface AdapterConformance {
  adapterName: string;
  portName: string;
  enforcedGuarantees: string[];
  unenforcedGuarantees: string[];
  limitations: string[];
  verifiedAt?: number;
}
```
```

---

## 3. Domain Type Reference

```typescript
export interface StopCondition {
  type: 'max_retries' | 'cost_limit' | 'time_limit' | 'consecutive_failures' | 'custom';
  threshold: number | string;
  description?: string;
}

export type TaskComplexity = 'LOW' | 'MEDIUM' | 'HIGH';
export type ApprovalState = 'draft' | 'approved' | 'rejected';

export interface TaskScope {
  in: string[];
  out: string[];
}

export interface Task {
  id: string;
  objective: string;
  inputs: ContextSpec;
  successCriteria: Criterion[];
  retryPolicy: RetryPolicy;
  modelPolicy: ModelPolicy;
  dependencies: string[];
  scope: TaskScope;
  estimatedComplexity: TaskComplexity;
  approvalState: ApprovalState;
  stopConditions: StopCondition[];
}

export interface AgentMessage {
  from: string;
  to: string;
  type: 'finding' | 'question' | 'task' | 'review' | 'failure' | 'completion';
  payload: unknown;
  evidence?: Evidence[];
}

export type VerificationStatus = 'verified' | 'failed' | 'skipped' | 'not_observed';
export type ReadinessLevel = 'draft' | 'pr-ready' | 'release-ready';

export interface VerificationResult {
  taskId: string;
  status: VerificationStatus;
  evidence: Evidence[];
  timestamp: number;
  readinessLevel: ReadinessLevel;
}

export interface ReviewFinding {
  id: string;
  severity: 'critical' | 'major' | 'minor' | 'info';
  category: string;
  description: string;
  filePath?: string;
  lineNumber?: number;
  suggestion?: string;
}

export interface ReviewResult {
  reviewer: string;
  approved: boolean;
  blockingFindings: ReviewFinding[];
  nonBlockingFindings: ReviewFinding[];
  summary: string;
  timestamp: number;
}

export type DriftType =
  | 'unplanned_task'
  | 'omitted_task'
  | 'out_of_sequence'
  | 'scope_creep'
  | 'unexpected_file_modification';

export interface DriftItem {
  type: DriftType;
  description: string;
  detectedAt: number;
  severity: 'low' | 'medium' | 'high';
  details?: Record<string, unknown>;
}

export interface DriftReport {
  taskId: string;
  driftScore: number; // 0 (no drift) to 1 (high drift)
  items: DriftItem[];
  projectedFromTraceEvents: number;
  timestamp: number;
}

export interface ContextPack {
  taskId: string;
  files: FileContext[];
  symbols: SymbolContext[];
  history: GitContext[];
  rules: RuleContext[];
  previousFindings: FindingContext[];
  tokenBudget: number;
  tokensUsed: number;
}
```

---

## 4. Dependency Rules (Enforced by `dependency-cruiser`)

```
contracts    → (nothing)
core         → contracts
adapters     → contracts, core (read-only)
cli          → core, adapters
benchmarks   → core, adapters
examples     → cli
```

**Forbidden:**
- `core` → `adapters`
- `core` → external SDKs (`@anthropic-ai/sdk`, `openai`, `node:fs`, `node:http`, `node:child_process`)
- `contracts` → anything

---

## 5. Configuration (`forge.yaml`)

```yaml
project:
  name: my-api

models:
  planner: anthropic/claude-sonnet-4
  developer: anthropic/claude-opus-4
  reviewer: openai/gpt-5
  fast: google/gemini-2.5-flash

agents:
  - explorer
  - planner
  - developer
  - tester
  - security-reviewer

workflow:
  strategy: adaptive
  phases:
    - discovery
    - planning
    - implementation
    - verification
    - review
    - repair

verification:
  required:
    - compile
    - unit-tests
    - static-analysis

permissions:
  shell: approval
  write: auto
  network: denied

trace:
  sinks:
    - type: jsonl
      path: .forge/traces/
    - type: otlp
      endpoint: http://localhost:4318
```

---

## 6. CLI Experience

```bash
npm install -g @forge/cli

cd my-project
forge

╭─────────────────────────────────────────────╮
│ Forge                                      │
│ Autonomous Engineering Runtime              │
╰─────────────────────────────────────────────╯

Project: my-api
Model: adaptive
Strategy: adaptive

forge> Add JWT authentication
```

Output:

```
[analysis] Understanding repository...
[context]  17 relevant files identified
[plan]     6 tasks created

[agent:explorer]       ✓
[agent:planner]        ✓
[agent:developer]      running

[developer]  4 files changed
[tester]     38/38 tests passed
[reviewer]   2 findings
[developer]  repairing...
[tester]     38/38 tests passed
[reviewer]   ✓ approved

✓ Task verified
```

---

## 7. Programmatic SDK

```typescript
import { Forge } from '@forge/core';

const forge = new Forge({
  project: './my-project',
  contracts: 'adaptive',
  trace: { sink: 'jsonl', path: '.forge/traces/' },
});

const result = await forge.run({
  task: 'Add OAuth authentication',
  verification: { required: ['compile', 'unit-tests'] },
});

console.log(result.status);        // 'verified'
console.log(result.evidence);      // ['build_passed', 'unit_tests_passed']
console.log(result.orchestration); // { planQuality: 0.82, coordination: 0.74, ... }
```

---

## 8. First Milestone (v0.1) Checklist

- [ ] M0: Repo scaffold + dependency-cruiser in CI
- [ ] M1: `@forge/contracts` — all ports + domain types, zero deps
- [ ] M2: `ModelProvider` port + contract tests + mock adapter
- [ ] M3: Claude adapter passes contract tests
- [ ] M4: Single-agent loop + `forge run "task"` works
- [ ] M5: `ToolPort` + filesystem, shell, git adapters
- [ ] M6: `VerificationPort` + "no self-declared done" gate
- [ ] M7: `ContextPort` + filesystem schema adapter
- [ ] M8: `TracePort` decorator (zero orchestrator changes)
- [ ] M9: `PolicyPort` decorator (zero orchestrator changes)
- [ ] M10: Second agent (reviewer) + handoff
- [ ] M11: `SubAgentRouter` heuristic
- [ ] M12: Publish `@forge/cli` to npm
- [ ] M13+: Adaptive orchestration + self-improvement loop

---

## 9. Key Design Decisions (ADRs Written & Planned)

| ADR | Decision |
|---|---|
| ADR-001 | Ports & adapters over monolithic architecture |
| ADR-002 | Fail-closed policy enforcement and non-overridable runtime floor |
| ADR-003 | No false parity in adapter conformance declarations |
| ADR-004 | Capability isolation: control plane ≠ data plane |
| ADR-005 | OpenTelemetry as trace format, not proprietary |
| ADR-006 | Harbor as benchmark runner, not custom (invoked as an external Python CLI via subprocess — not an npm dependency) |
| ADR-007 | Self-improvement via bounded edits + regression validation |
| ADR-008 | npm as distribution, not marketplace |
| ADR-009 | Orchestration quality (internal OQS scorer) as first-class metric |
| ADR-010 | Complexity classifier: heuristic first, LLM later |
