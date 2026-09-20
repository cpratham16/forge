# Phase 5 Implementation Plan — npm Publication + Self-Improvement Loop

> This is the most critical phase. Every decision must be justified against the research in `RESEARCH_AND_DISCUSSION.md` and the PRD. No prototype code — production-ready only.

---

## Current State Analysis

### What Exists (Phases 0-4 Complete)
| Package | Status | Key Exports |
|---------|--------|-------------|
| `@runforge/contracts` | ✅ | All ports + domain types + `AdapterConformance` |
| `@runforge/core` | ✅ | Orchestration (single/two-agent), OQS, Drift, Policy, Trace, StopConditions |
| `@runforge/adapters` | ✅ | Model (Claude, Mock, OpenAI-Compatible), Tools, Verification, Context, Trace, Policy |
| `@runforge/cli` | ⚠️ Private | `forgeRun()`, `trace show/list`, bin entry point |

### What's Missing for Phase 5
1. **npm publication**: `@runforge/cli` is `private: true`, no build step, no dist exports
2. **AdapterConformance CLI**: No `forge conformance` command to surface adapter metadata
3. **Weakness Mining**: No trace analysis script
4. **Bounded Proposals**: No proposal system for harness edits
5. **Regression Validation**: No held-in/held-out harness evaluation
6. **Self-Improvement Loop**: No integration of the three components

---

## Phase 5 Deliverables Breakdown

### 5.1 npm Publication Infrastructure (M12)

**Goal**: Make `@runforge/cli` publishable to npm as a public package.

**Required Changes**:

| File | Change | Reason |
|------|--------|--------|
| `packages/cli/package.json` | Remove `private: true` | Required for public npm publish |
| `packages/cli/package.json` | Add `files: ["dist"]` | Only publish compiled output |
| `packages/cli/package.json` | Add `build` script | Compile TypeScript to `dist/` |
| `packages/cli/package.json` | Update `main`/`types`/`exports` | Point to `dist/` not `src/` |
| `packages/cli/tsconfig.json` | Add `declaration: true`, `outDir: dist` | Generate `.d.ts` for consumers |
| Root `package.json` | Add `release` script | Coordinated publish workflow |
| `.npmignore` | Create | Exclude test files, source, etc. |
| `pnpm-workspace.yaml` | No change | Workspace structure unchanged |

**Build Output Structure**:
```
packages/cli/dist/
├── index.js          # Main entry (bin)
├── index.d.ts        # Types
├── commands/
│   ├── trace.js
│   ├── trace.d.ts
│   ├── model.js      # Phase 7
│   ├── model.d.ts
│   └── conformance.js # NEW
└── ...
```

**Version Strategy**: `0.1.0` for first publish (matches existing version in package.json)

---

### 5.2 AdapterConformance CLI Surfacing (A11)

**Goal**: `forge conformance` command shows conformance metadata for all registered adapters.

**New Files**:
```
packages/cli/src/commands/conformance.ts    # CLI command
packages/cli/src/commands/index.ts          # Barrel export (NEW)
```

**Command Interface**:
```bash
$ forge conformance
# Shows table:
# ┌─────────────┬──────────────┬──────────────────────┬────────────────────┐
# │ Adapter     │ Port         │ Enforced             │ Limitations        │
# ├─────────────┼──────────────┼──────────────────────┼────────────────────┤
# │ mock        │ ModelProvider│ returns-valid-resp   │ fixed responses    │
# │ claude      │ ModelProvider│ actual-llm-inference │ needs ANTHROPIC_   │
# │ openai-compat│ ModelProvider│ actual-llm-inference │ needs endpoint     │
# │ filesystem  │ ToolPort     │ path validation      │ local FS only      │
# └─────────────┴──────────────┴──────────────────────┴────────────────────┘

$ forge conformance --port ModelProvider
# Filter by port

$ forge conformance --json
# Machine-readable output for CI
```

**Implementation**:
- Iterate all adapters exported from `@runforge/adapters`
- Call static `.conformance()` method on each
- Validate against `AdapterConformance` contract
- Render as table (default) or JSON

---

### 5.3 Weakness Mining Script

**Goal**: Analyze failure traces to identify reusable failure mechanisms.

**Based on Self-Harness (Zhang et al.) + HALO + ACE patterns**:

**Failure Mechanism Clusters** (from RESEARCH_AND_DISCUSSION.md):
1. **Missing Final Artifact** — Agent declares done but verification fails
2. **Repeated Invalid Command** — Same tool call fails repeatedly without adaptation
3. **No Recovery After Tool Error** — Tool fails, agent doesn't try alternative
4. **Exploration Without Implementation** — Many read/search calls, no write/edit

**New Files**:
```
packages/core/src/self-improvement/weakness-miner.ts
packages/cli/src/commands/mine.ts           # CLI: forge mine [--trace-dir]
```

**Algorithm**:
```
Input: Trace directory (JSONL files)
For each run:
  1. Parse all TraceEvents
  2. Identify failure patterns:
     - VerificationResult.status === 'failed' + no retry → Missing Final Artifact
     - Same tool.call repeated >3 times with error → Repeated Invalid Command
     - tool.result.error + no subsequent tool.call → No Recovery
     - High read/search : write/edit ratio (>10:1) → Exploration Without Implementation
  3. Cluster by mechanism, count occurrences
  4. Rank by frequency × impact (cost of failure)
Output: WeaknessReport with clusters, examples, suggested fixes
```

**Output Format**:
```json
{
  "clusters": [
    {
      "mechanism": "missing_final_artifact",
      "count": 47,
      "exampleRuns": ["r-abc123", "r-def456"],
      "suggestedFix": "Strengthen verification gate; require evidence before done"
    }
  ],
  "totalRunsAnalyzed": 200,
  "generatedAt": 1700000000000
}
```

---

### 5.4 Bounded Proposal System

**Goal**: Define editable surface for harness, generate proposals from weakness mining.

**Based on Self-Harness + HALO + ACE**:

**Editable Surface** (what the harness can modify):
| Surface | Description | Regression Risk |
|---------|-------------|-----------------|
| `systemPrompt` | Main agent prompt | Medium — behavior shift |
| `toolSelectionRules` | Which tools available per agent | High — capability change |
| `verificationMiddleware` | Custom verification logic | High — gate bypass risk |
| `recoveryPolicy` | Retry/fallback on tool failure | Medium — loop behavior |
| `agentGraph` | Sub-agent topology (Phase 6) | High — coordination change |

**Proposal Schema**:
```typescript
interface HarnessProposal {
  id: string;
  sourceWeakness: string;           // From WeaknessReport
  surface: keyof EditableSurface;   // Which editable surface
  change: string;                   // Human-readable description
  diff: string;                     // Unified diff of the change
  regressionRisk: 'low' | 'medium' | 'high';
  estimatedImpact: string;          // What behavior changes
  createdAt: number;
  status: 'pending' | 'validated' | 'rejected' | 'applied';
}
```

**New Files**:
```
packages/core/src/self-improvement/proposal-generator.ts
packages/core/src/self-improvement/editable-surface.ts
packages/core/src/self-improvement/index.ts
packages/cli/src/commands/propose.ts  # CLI: forge propose [--apply]
```

**Generator Logic**:
```
Input: WeaknessReport
For each cluster:
  1. Match cluster → editable surface(s)
  2. Generate candidate diff (using LLM or template)
  3. Assess regression risk
  4. Create HarnessProposal
Output: Proposal[]
```

---

### 5.5 Regression Validation

**Goal**: Evaluate candidate harness against held-in/held-out task splits.

**Based on Self-Harness validation protocol**:

**Process**:
```
Input: HarnessProposal (with diff)
1. Apply diff to create candidate harness (in temp directory)
2. Split tasks: held-in (development) + held-out (validation)
   - Terminal-Bench tasks split 70/30
   - SWE-bench tasks split 70/30
3. Run candidate harness on both splits
4. Compare to baseline harness:
   - At least one split must improve (pass@1 ↑, cost ↓, latency ↓)
   - Neither split must regress beyond tolerance (pass@1 ↓ > 5%)
5. Accept if: (heldInImproves || heldOutImproves) && !heldInRegressed && !heldOutRegressed
```

**New Files**:
```
packages/core/src/self-improvement/regression-validator.ts
packages/core/src/self-improvement/harness-runner.ts
packages/cli/src/commands/validate.ts   # CLI: forge validate <proposal-id>
benchmarks/self-improvement/            # Held-in/held-out task sets
```

**Held-in/Held-out Task Sets**:
- Store in `benchmarks/self-improvement/held-in.json` and `held-out.json`
- Each: array of task definitions compatible with Harbor
- Curated from Terminal-Bench 2.0 + SWE-bench Verified subsets

---

### 5.6 Self-Improvement Loop Integration

**Goal**: Wire all three components into an automated loop.

**Loop**:
```
┌─────────────────┐
│  Run Tasks      │  (generate traces)
└────────┬────────┘
         ▼
┌─────────────────┐
│  Mine Weaknesses│  (analyze traces → clusters)
└────────┬────────┘
         ▼
┌─────────────────┐
│  Generate Props │  (bounded proposals from clusters)
└────────┬────────┘
         ▼
┌─────────────────┐
│ Validate Props  │  (regression validation)
└────────┬────────┘
         ▼
    ┌────┴────┐
    ▼         ▼
 Accept    Reject
    │         │
    └────┬────┘
         ▼
   (applied to harness)
```

**CLI Command**: `forge improve [--rounds N] [--auto-apply]`

**New Files**:
```
packages/core/src/self-improvement/loop.ts
packages/cli/src/commands/improve.ts
```

---

## Implementation Order (Dependency-Aware)

| Step | Component | Depends On | Est. Files |
|------|-----------|------------|------------|
| 1 | npm Publication Infrastructure | — | 5 |
| 2 | AdapterConformance CLI | 1 (exports) | 3 |
| 3 | Weakness Miner | Traces exist | 4 |
| 4 | Editable Surface Definition | Core types | 2 |
| 5 | Proposal Generator | 3, 4 | 3 |
| 6 | Regression Validator | 5, Benchmarks | 4 |
| 7 | Self-Improvement Loop | 3, 5, 6 | 2 |
| 8 | CLI Commands (mine, propose, validate, improve) | 2-7 | 5 |
| 9 | Tests | All above | 8 |
| 10 | Benchmark Integration | All above | 2 |

**Total New Files**: ~38
**Modified Files**: ~12 (package.json, exports, STATE.md)

---

## TypeScript/Build Requirements

### CLI Build Configuration
```json
// packages/cli/tsconfig.json additions
{
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true
  }
}
```

### Root Build Script
```json
// package.json
{
  "scripts": {
    "build": "pnpm --filter @runforge/cli run build",
    "build:all": "pnpm --filter @runforge/contracts run build && pnpm --filter @runforge/core run build && pnpm --filter @runforge/adapters run build && pnpm --filter @runforge/cli run build",
    "release": "pnpm build && pnpm test && pnpm dep-check && changeset publish"
  }
}
```

---

## Test Strategy

### Unit Tests (Core)
- `weakness-miner.test.ts` — pattern detection on synthetic traces
- `proposal-generator.test.ts` — proposal creation from clusters
- `regression-validator.test.ts` — validation logic with mock harnesses
- `editable-surface.test.ts` — surface definition validation

### Integration Tests (CLI)
- `conformance.test.ts` — `forge conformance` output validation
- `mine.test.ts` — `forge mine` on test trace directory
- `propose.test.ts` — `forge propose` generates valid proposals
- `validate.test.ts` — `forge validate` accepts/rejects correctly
- `improve.test.ts` — `forge improve` runs full loop (mocked)

### Contract Tests (Adapters)
- Add `openai-compatible` to conformance test suite (already done)

---

## Benchmark Strategy (Phase 5)

Per `PHASED_PLAN.md`:
- Run Terminal-Bench again via Harbor
- Compare pass@1 and cost to Phase 4 baseline
- Run **full internal OQS five-dimension evaluation**
- Publish methodology document

**Implementation**: Extend `benchmarks/terminal-bench/run.mjs` or create `benchmarks/phase-5/run.mjs`

---

## Security Considerations

Per `RESEARCH_AND_DISCUSSION.md` Part 7 (Capability Isolation):
- Self-improvement loop runs in **isolated environment**
- Proposal validation uses **separate process** (no control-plane access)
- Applied changes go through **policy gate** before affecting production
- Trace data used for mining is **read-only** for the miner

---

## Dependencies to Add

| Package | Purpose | Location |
|---------|---------|----------|
| `diff` | Generate unified diffs for proposals | `@runforge/core` (dev) |
| `fast-glob` | Find trace files | `@runforge/core` |
| `js-yaml` | Parse forge.yaml for editable surfaces | `@runforge/core` |
| `@types/diff` | Types for diff | `@runforge/core` (dev) |

**Note**: No new external SDKs in `core`. All new deps in `adapters` or `cli` only.

---

## Gate Criteria for Phase 5 Merge

Per `AGENTS.md` §7:

1. ✅ `pnpm lint` — passes with `--max-warnings=0`
2. ✅ `pnpm dep-check` — zero violations
3. ✅ `pnpm typecheck` — `tsc -b` passes
4. ✅ `pnpm test` — all tests pass (including new Phase 5 tests)
5. ✅ Benchmark gate — `pnpm bench:phase -- --phase 5` + compare vs Phase 4 baseline

---

## Next Steps

1. **Review this plan** — confirm approach aligns with your vision
2. **Start with Step 1** — npm publication infrastructure (foundational)
3. **Iterate through steps** — each step gates the next
4. **Verify at each step** — run lint/typecheck/test before proceeding
5. **Final verification** — full gate before PR

---

## Questions for Alignment

1. **npm scope**: Publish as `@runforge/cli` only, or also `@runforge/core`, `@runforge/contracts`, `@runforge/adapters`?
2. **Registry**: Public npmjs.org, or private registry first?
3. **Versioning**: Start at `0.1.0` or `0.0.1` for pre-release?
4. **Self-improvement loop**: Run automatically on schedule, or only via `forge improve` CLI?
5. **Held-in/held-out tasks**: Use existing Terminal-Bench subset, or curate custom tasks?
6. **Proposal application**: Auto-apply validated proposals, or require manual approval?

---

*Ready to proceed with Step 1 (npm publication infrastructure) when you confirm the plan.*