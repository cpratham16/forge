# Forge — Research & Discussion Compilation

> This document captures every research finding, architectural decision, and critical evaluation from our discussion.

---

## Part 1: The Harness Thesis

### The Central Evidence

- **ARC-AGI-3**: GPT-6 Astra scored **62.7%** with standard harness vs. **99.9%** with provider-adapter harness preserving opaque reasoning state and compaction. Same weights, same model, different reasoning-state handling between calls.
- **GAIA**: Same model spans **74.6%** with right harness to **44.8%** bare — a 30-point spread.
- **SWE-bench**: Swapping the harness around an LLM moves scores by **22 points**; swapping the model moves them by **1**.
- **LangChain**: Terminal-Bench 2.0 with fixed model (GPT-5.2-Codex) improved from **52.8 → 66.5** by changing only the harness.

**Conclusion:** The runtime — not the underlying model — is the dominant variable. Forge's core project must be the orchestration runtime.

### The Astra Caveat

The 62.7% → 99.9% jump is an extreme outlier. The broader evidence supports the thesis with a more modest effect size (7–30 points). Use GAIA's 30-point spread as the sturdier reference point; **use RigorBench's 41% process quality figure with caution, not as settled evidence** — see the RigorBench Caveat in Part 3. Astra is an anecdote, not the foundation.

---

## Part 2: What Top Players Are Actually Good At

| System | Biggest Strength | What to Learn |
|---|---|---|
| **Claude Code** | Agent extensibility + subagents + teams + hooks + skills | First-class agent lifecycle and extension system |
| **Codex CLI** | Sandboxing + approvals + autonomous execution | Safety and execution policy as fundamental |
| **OpenCode** | Model/provider flexibility + C/S architecture | Don't lock runtime to one model vendor |
| **Aider** | Repository understanding + architect/editor separation + Git | Context construction and edit reliability |
| **Vorflux** | Orchestration/autonomy across full SDLC | Workflow, verification, delegation as the product |

### Specifics

- **Claude Code**: Dynamic workflows let Claude write orchestration scripts running tens to hundreds of parallel subagents, with adversarial agents working to break results before they reach you. Hooks fire on lifecycle events and can execute scripts, HTTP requests, prompts, or spawn subagents.
- **Codex**: Five independent security layers: approval policies, command safety checks, path validation, OS-level sandboxing, resource limits.
- **OpenCode**: Client-server-agent three-layer model with hidden server managing state even in terminal mode. Supports 75+ providers and local models.
- **Aider**: Repo map uses tree-sitter + PageRank to rank file relevance within token budget — its #1 innovation.

---

## Part 3: Verified Claims (Re-checked)

| Claim | Status | Source |
|---|---|---|
| ARC-AGI-3 harness gap | ✅ Confirmed, understated | ARC Prize |
| Uber 70%+ PRs from agents | ✅ Confirmed | Uber engineering blog |
| NVIDIA POLAR at model-API boundary | ✅ Confirmed, sharper than described | MarkTechPost |
| Uber 3,600+ skills, 30K+ executions/day | ✅ Confirmed | Multiple outlets |
| Sierra Hyper-τ-Bench 23.9% vs 82.2% | ⚠️ Real but misleading comparison | Expert-authored reference ceiling, not autonomous |
| DeepSeek 90.6% vs 74.53% | ⚠️ Vendor vs independent, not harness-vs-harness | Better evidence: GAIA 30-point spread |
| RigorBench 41%/17% process-quality gain | ⚠️ Real benchmark, headline figure disputed | arXiv:2606.22678 + independent review |
| Self-Harness "Haiku: 18→23 of 28 (64%→82%)" | ❌ Not found in the cited paper | arXiv:2606.09498 tests different models |
| "EPOB" benchmark | ❌ Could not verify this exists | No matching publication found |

### Hyper-τ-Bench Caveat

The 23.9% measures **autonomous construction**; the 82.2% measures **human-AI collaborative construction**. This is apples-to-oranges. Forge's orchestration benchmark should explicitly measure where on this spectrum its strategies land.

### DeepSeek Caveat

Vendor benchmarks are unreliable because the **harness is unreported**. This strengthens the argument for Forge's trace-recording architecture.

### RigorBench Caveat

RigorBench (arXiv:2606.22678, "Benchmarking Engineering Process Discipline in Autonomous AI Coding Agents") is a real, published benchmark with five pillars — Planning Fidelity, Verification Coverage, Recovery Efficiency, Abstention Quality, Atomic Transition Integrity — scored on 30 tasks. Two things temper how much weight the 41%/17% figures can carry: (1) the paper discloses a conflict of interest, since its authors co-developed one of the harness frameworks the benchmark evaluates; (2) an independent review of the paper concluded the specific 41%/17% gains rest on pillars and tasks the paper doesn't sufficiently justify. Treat RigorBench as a legitimate framework to build toward, but treat "41% improvement" as a claim to re-derive on Forge's own tasks rather than a number to cite as settled.

### Self-Harness Caveat

Self-Harness (arXiv:2606.09498, "Self-Harness: Harnesses That Improve Themselves," Zhang et al.) is real and its three-stage loop — Weakness Mining, Harness Proposal, Proposal Validation — is accurately described elsewhere in this document. But the specific number attached to it earlier in this plan, "Haiku: 18 → 23 of 28 issues resolved (64% → 82%)," does not appear in the paper. The paper instantiates the loop on Terminal-Bench 2.0, SWE-bench Verified, and AppWorld using MiniMax M2.5, Qwen3.5-35B-A3B, and GLM-5 — not Claude Haiku — reporting relative gains of up to 132% across all nine model–benchmark combinations. Pull the exact per-model, per-benchmark number from the paper directly before citing one externally.

### EPOB Caveat

This plan originally cited "EPOB" (Plan Quality, Assignment Quality, Coordination, Deliverable Quality, Efficiency) as an adopted external benchmark alongside MAFBench, OrchestrationBench, and RigorBench. No publication under that name could be found. Since Phase 4 of `PHASED_PLAN.md` already independently defines the same five dimensions as an **internal orchestration scorer** Forge builds itself, this document now treats them as one thing — Forge's own internal metric (referred to as **OQS**, Orchestration Quality Score) — rather than implying there's a second, external "EPOB" standard to adopt. If a real external benchmark by this or a similar name turns up later, it should be evaluated as its own addition, not silently merged back into OQS.

---

## Part 4: Key Research Papers & Frameworks

### Benchmarks

| Benchmark | Measures | Key Finding |
|---|---|---|
| **MAFBench** | Architectural design choices across orchestration, memory, planning, specialization, coordination | Framework-level design choices alone can increase latency by over 100x |
| **OrchestrationBench** | Workflow-based planning + constraint-aware tool execution across 17 domains | Function calling performance is consistent; planning capability varies substantially across models |
| **Internal OQS** *(not external — see EPOB Caveat, Part 3)* | Plan Quality, Assignment Quality, Coordination, Deliverable Quality, Efficiency | Same base model behaves differently because systems orchestrate work differently |
| **RigorBench** *(see caveat, Part 3)* | Planning Fidelity, Verification Coverage, Recovery Efficiency, Abstention Quality, Atomic Transition Integrity | Structured discipline improves process quality 41% and outcome correctness 17% |
| **ClawArena-Team** | Subagent management: leader creates specialists, delegates, orchestrates parallel returns | Management bottleneck is **privilege granting, not perception** |
| **Harbor** | Terminal-Bench 2.0 official harness | Evaluates arbitrary agents, supports cloud providers, records tokens/cost/duration/reward. **Python CLI** (`pip install harbor`), not an npm package — invoke as a subprocess from the TS toolchain. |

### Self-Improvement Systems

| System | Mechanism | Result |
|---|---|---|
| **Self-Harness** *(see caveat, Part 3)* | Weakness mining → bounded harness proposal → regression validation | Up to 132% relative gain across 9 model×benchmark combinations (MiniMax M2.5, Qwen3.5-35B-A3B, GLM-5 on Terminal-Bench 2.0, SWE-bench Verified, AppWorld) — not a Haiku-specific result |
| **HALO** | OTel traces → RLM engine → failure decomposition → coding agent applies changes → repeat | AppWorld: 73.7 → 89.5 |
| **ACE** | Generator records → Reflector extracts → Curator manages → Manager injects | Human-readable markdown with helpful/harmful counters |

### TypeScript Agent Frameworks

| Package | What It Gives You | Key Pattern |
|---|---|---|
| `@arasandev/harness` | Clean-room TypeScript agent harness; vendor-neutral composable kernel | Loop, tool execution, permission gating, hooks, subagent delegation, compaction, transcript persistence |
| `@a-dray/aglib` | Four seams with adapters: model, store, sandbox, harness | Session log as state, not record; loop re-projects context from committed entries every turn |
| `polyglot-agent-harness` | Extensible TypeScript foundation for repository-aware coding agents | Deliberately separates agent kernel from model providers, repository intelligence, policies, sandboxes, tools, language plugins |
| `@clearideas/agent-runtime` | Standalone TypeScript runtime for portable, declarative agents | Dependency-aware graph execution; parallel scheduling of independent branches |
| `crossagents-runtime` | Provider-agnostic, model-adaptive agent runtime | Pattern selector filters by task requirements, model capabilities, policy, scores survivors |
| `AgentOS` *(package name unverified — see caveat below)* | TypeScript-first orchestration runtime | Six orchestration strategies: adaptive, graph, hierarchical, debate |
| `ise-harness` | Memory and context management focus | SQLite session persistence, codebase semantic indexing, on-demand retrieval, history compaction |
| `@thoughtflow/core` | TypeScript framework for autonomous AI agents | Adapter system (OpenAI, Anthropic, Ollama, vLLM, mock); subagent orchestration with isolated context |

**Package Maturity Caveat:** every scoped package in this table was checked directly against the npm registry. All exist, but nearly all were first published between February and September 2026, most sit at v0.1.0–v0.4.1 with only 1–9 published versions, and they read as solo-maintainer projects with no track record. `AgentOS` specifically could not be found under that exact literal name (a plain-name lookup returned 404) — confirm the real package identifier before depending on it. Treat this table as a source of **patterns to read and possibly vendor/fork**, not as a list of dependencies safe to pin into a production `package.json` without individually vetting each one (maintenance activity, license, bus factor) first.

### Evaluation Frameworks

| Tool | Purpose |
|---|---|
| `@tally-evals/tally` *(early-stage — see Package Maturity Caveat above; v0.1.0, 3 published versions as of Sept 2026)* | TypeScript framework for evaluating LLM agents with datasets, metrics, scorers, evals |
| `@arizeai/openinference-instrumentation-openai-agents` | OpenTelemetry-based instrumentation for OpenAI Agents SDK |
| `@microsoft/agents-telemetry` | OpenTelemetry instrumentation primitives for Microsoft Agents SDK |

---

## Part 5: Critical Flaws in the Original Forge Design

### Flaw 1: POLAR trajectory recording treated as future capability

**Problem:** Document said "eventually Forge could use those traces." But ACE, HALO, and Self-Harness already implement trajectory-to-improvement loops today.

**Better alternative:** Don't build bespoke trajectory system. Adopt/fork ACE-style loop. Real differentiator is **correlating trajectory insights with orchestration decisions** (which agent was selected, why, was it optimal) rather than just tool-call success.

### Flaw 2: Uber's software factory → npm conclusion leap

**Problem:** Leaped from "Uber has many skills" to "skills should be npm packages." Uber's 3,600 skills are internal artifact of massive org with dedicated platform teams. Composability is plausible; npm distribution is an **analogy**, not validated conclusion.

**Deeper signal:** Uber's 52% cost/session reduction comes from **orchestration efficiency**, not marketplace. At scale, bottleneck shifts from capability to orchestration overhead.

**Better alternative:** Treat **orchestration cost as first-class metric**. npm ecosystem is a distribution hypothesis, not validated product strategy.

### Flaw 3: Security as policy problem, not architectural problem

**Problem:** DeepSeek Harness CVE-2026-82533 (CVSS 9.4). **Correction to the original mechanism description:** the harness's local control-plane API authenticated requests by trusting the client-supplied `Host` header instead of validating the actual TCP connection origin. A request with a spoofed `Host` header could be treated as trusted local traffic and escalate the session to unconfined (`danger-full-access`) execution, without credentials. The agent didn't jailbreak the model — **it exploited the harness's own trust boundary** between what it assumed was local, trusted traffic and what was actually reachable over the network.

**Better alternative:** Policy architecture (ALLOW/APPROVE/DENY) is necessary but insufficient. Add **capability isolation layer**: agent execution environment must not have network access to harness control interface. Control plane and data plane separated at network level, not just policy level.

### Flaw 4: No evaluation methodology for orchestration quality

**Problem:** Strategic loop ended with "Evaluate strategy → Improve orchestration policy" but provided **no mechanism** for evaluating strategy quality.

**Better alternative:** Build an internal OQS (Orchestration Quality Score) across five dimensions as internal quality metrics. Instrument every run to produce Plan Quality, Assignment Quality, Coordination, Deliverable Quality, Efficiency scores. Use those scores as training signal for self-improving loop, not raw success/failure.

---

## Part 6: The Three-Layer Evaluation Strategy

### Layer 1: Outcome Benchmarks (What)
- Terminal-Bench 2.0, SWE-bench Pro, GAIA, Hyper-τ-Bench
- Tell you **whether** harness solves tasks
- Don't tell you **why**

### Layer 2: Process Benchmarks (How)
- RigorBench: Planning Fidelity, Verification Coverage, Recovery Efficiency, Abstention Quality, Atomic Transition Integrity
- Give you **diagnosis**
- Structured discipline raises process quality 41%, outcome correctness 17% (headline figure — see RigorBench Caveat, Part 3, before citing externally)

### Layer 3: Orchestration Benchmarks (Coordination)
- Internal OQS (Forge's own scorer, not an external benchmark — see EPOB Caveat, Part 3): Plan Quality, Assignment Quality, Coordination, Deliverable Quality, Efficiency
- MAFBench: orchestration, memory, planning, specialization, coordination
- ClawArena-Team: subagent management, privilege granting
- Measure what outcome-only evaluation does not reveal

### Closing the Loop
- Trajectory data is the **training signal for the harness itself**
- Weakness mining → bounded proposal → regression validation
- This is what makes Forge distinct from Claude Code, OpenCode, Codex, Vorflux

---

## Part 7: Capability Isolation (Beyond Policy)

```
                 Agent
                   │
                   ▼
             Action Request
                   │
                   ▼
             Policy Engine
                   │
       ┌───────────┼───────────┐
       ▼           ▼           ▼
     ALLOW       APPROVE      DENY
       │           │
       ▼           ▼
   Sandbox      Human
       │        approval
       └────┬──────┘
            ▼
        Execution
```

**Critical addition:** The agent's execution environment must not have network access to the harness's control interface. The control plane and data plane must be separated at the **network level**, not just the policy level.

---

## Part 8: What to Build vs. What to Compose

### Build (Forge-Specific)
- Port contracts (`@forge/contracts`)
- Orchestration quality scorer (internal OQS, 5-dim — see EPOB Caveat, Part 3)
- Complexity classifier + dynamic graph generator
- Self-improvement loop (weakness mining → bounded proposal → regression validation)
- Capability isolation layer

### Compose (Existing Ecosystem)
- Agent loop kernel: `@arasandev/harness` patterns *(early-stage package — see Package Maturity Caveat, Part 4; read for the pattern, vet before depending on it directly)*
- Tracing: OpenTelemetry + OpenInference *(established, stable)*
- Evaluation: `@tally-evals/tally` *(early-stage — same caveat)*
- Benchmark runner: Harbor *(Python CLI — invoke via subprocess, not an npm import)*
- Architecture enforcement: `dependency-cruiser` *(established, stable)*
- Context construction: `ise-harness` memory patterns *(early-stage — same caveat)*
- Graph execution: `@clearideas/agent-runtime` dependency-aware scheduling *(early-stage — same caveat)*

---

## Part 9: Key Metrics to Track

| Metric | Source | Target |
|---|---|---|
| Terminal-Bench 2.0 pass@1 | Harbor (Python CLI) | ≥ baseline |
| SWE-bench Verified resolution | Harbor (Python CLI) | ≥ baseline |
| OQS composite (5-dim) | Internal scorer | ≥ 0.7 |
| RigorBench process quality | RigorBench *(caveat, Part 3)* | ≥ 41% improvement (re-derive on own tasks) |
| Orchestration overhead | MAFBench | Measured, minimized |
| Cost per verified task | Trace store | ≤ 50% baseline |
| Recovery efficiency | RigorBench pillar | ≥ baseline |
| Abstention quality | RigorBench pillar | ≥ baseline |
| Delegation efficiency | ClawArena-Team pattern | Measured |
