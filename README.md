<div align="center">

# ⚡ Forge

### Build your own coding agent. Not someone else's.

**A model-agnostic orchestration runtime that turns any LLM into a disciplined, verifiable engineering team.**

[![CI](https://github.com/cpratham16/forge/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/cpratham16/forge/actions/workflows/ci.yml)
[![Benchmark Gate](https://github.com/cpratham16/forge/actions/workflows/benchmark-gate.yml/badge.svg?branch=develop)](https://github.com/cpratham16/forge/actions/workflows/benchmark-gate.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Node.js 22+](https://img.shields.io/badge/node-%3E%3D22-339933.svg?logo=node.js)](.nvmrc)

</div>

---

<div align="center">

### 🔒 Closed harnesses make you rent someone else's brain.
### 🔓 Forge lets you build your own.

</div>

---

## The problem, in one sentence

Every coding agent you've used — Claude Code, Codex, OpenCode, Aider — is a **closed box**. You get *their* orchestration, *their* safety rules, *their* verification, and you can't measure, replace, or improve any of it.

And it matters more than the model. **Harness design alone moves benchmark scores by 20+ points. Swapping the model moves them by 1.** Yet the harness is the least accessible layer of every tool you use.

Forge is the open alternative.

---

## What you get

<div align="center">

```text
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   You write a task.                                          │
│   Forge plans it, delegates it, verifies it, and proves it.  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

</div>

### 🧠 It plans before it codes

Forge refuses to write a single line until it has produced a **contract** — scope, acceptance criteria, and stop conditions. No vibe coding. No surprise scope creep.

```text
forge plan "Add OAuth login"

✔ Intent parsed
✔ Scope: auth/, middleware/, tests/auth/
✔ Out of scope: UI redesign, database schema
✔ Acceptance: 3 criteria
✔ Stop conditions: max 5 retries, no-progress after 3 turns

Approve? [y/N]
```

### 👥 It delegates to a team, not a single agent

A planner, a developer, a reviewer — each with its own permissions, its own context, and its own accountability. The reviewer can't write files. The developer can't approve its own work. Separation of powers, enforced at runtime.

```text
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Explorer   │ ──▶ │   Planner   │ ──▶ │  Developer  │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │  Reviewer   │
                                        └──────┬──────┘
                                               │
                                    ┌──────────┴──────────┐
                                    ▼                     ▼
                                ⛔ blocked             ✅ approved
```

### 🔍 It verifies with evidence, not promises

The model's "I'm done" is not completion. Forge requires **evidence**: builds passed, tests passed, lint passed, review approved. If evidence is missing, the task is not done — it's `not_observed`. That distinction is enforced.

```json
{
  "status": "verified",
  "evidence": [
    "build_passed",
    "unit_tests_passed (38/38)",
    "lint_passed",
    "review_approved"
  ]
}
```

### 🛡️ It has a hard floor you cannot lower

Some actions are denied by design, no matter what your config says, no matter what the model asks for. Destructive git operations. Force pushes. Secret file access. The runtime floor is compiled into `core` — `forge.yaml` can never widen it.

```text
Runtime Floor (non-overridable)
  ✗ git commit --no-verify
  ✗ git reset --hard
  ✗ git push --force
  ✗ read .env, *.pem, *.key
  ✗ write .ssh/**

Configurable Guardrails (R01–R15)
  ⚠ npm install *        → confirm
  ⚠ git push *           → confirm
  ⚠ network *.prod.*     → deny
```

### 📊 It measures its own orchestration quality

Every run produces an Orchestration Quality Score across five dimensions — plan quality, assignment quality, coordination, deliverable quality, efficiency. No other harness does this. Forge tells you *why* a run succeeded or failed, not just whether it did.

```text
┌────────────────────────────┬────────┐
│ Plan Quality               │  0.87  │
│ Assignment Quality         │  0.74  │
│ Coordination               │  0.81  │
│ Deliverable Quality        │  0.92  │
│ Efficiency                 │  0.68  │
├────────────────────────────┼────────┤
│ Composite OQS              │  0.80  │
└────────────────────────────┴────────┘

Drift: 2 tasks (medium severity)
  ⚠ developer added "refactor auth" — not in contract
  ⚠ tester skipped integration tests — no evidence
```

### 🔌 Every layer is swappable — by you, not by us

Model provider. Tools. Verification. Context. Policy. Tracing. Delegation. Each is a port with a contract. Any implementation of that contract plugs in. You want to run on a local model? Write an adapter. You want a different reviewer? Write an adapter. The orchestrator never changes.

```bash
npm install @runforge/model-local-llama
npm install @runforge/policy-hipaa
npm install @runforge/context-tree-sitter-repo-map
```

---

## Why this matters

<div align="center">

| Without Forge | With Forge |
| --- | --- |
| "The agent said it was done" | "The agent produced evidence it was done" |
| Hidden orchestration you can't measure | OQS score for every run |
| Safety via prompt engineering | Safety via runtime enforcement |
| Locked to one model vendor | Any model, any provider, any time |
| A closed harness | A runtime you own |

</div>

---

## Try it in 30 seconds

```bash
git clone https://github.com/cpratham16/forge.git
cd forge
corepack enable && corepack prepare pnpm@9.12.0 --activate
pnpm install && pnpm build

# Run against a mock provider — no API key required
node packages/cli/dist/index.js run "list the files in packages/core/src" --mock

# See what every adapter actually guarantees
node packages/cli/dist/index.js conformance

# Inspect the trace of your run
node packages/cli/dist/index.js trace list
```

---

## What "no false parity" means

Two adapters can implement the same port and **not** be equivalent. Forge makes that explicit. `forge conformance` reports, per adapter, exactly which guarantees are enforced and which are not — because pretending they're equal is how silent failures happen.

```text
Adapter    │ Port          │ Enforced                          │ Not enforced
───────────┼───────────────┼───────────────────────────────────┼─────────────────────
claude     │ ModelProvider │ valid-response, token-usage       │ streaming, caching
filesystem │ ToolPort      │ path-confinement, no-traversal    │ symlink-handling
shell      │ ToolPort      │ stdout-capture, exit-code         │ resource-limits
```

The principle behind this — **never present unequal enforcement as equivalent** — is [ADR-012](docs/adr/).

---

## Architecture at a glance

Forge is built on ports and adapters (hexagonal architecture). The dependency rule is enforced by `dependency-cruiser` in CI on every PR — not by convention.

```text
contracts   →  (nothing)
core        →  contracts
adapters    →  contracts, core
cli         →  core, adapters, contracts
```

`core` never imports an adapter, a vendor SDK, or a node builtin. New capabilities are added as adapters or as decorators around existing ports — never by editing the orchestrator. Tracing wraps `ModelProvider`. Policy wraps `ToolPort`. Same pattern, every time.

See [ADR-001](docs/adr/) for the reasoning.

---

## Repository layout

```text
docs/            PRD, phased build plan, research, architecture reference, ADRs
packages/
  contracts/     pure ports + domain types — zero dependencies, enforced in CI
  core/          orchestrator, policy engine, quality scoring — no external imports
  adapters/      model providers, tools, verification, context, trace, policy
  cli/           composition root, published as @runforge/cli
benchmarks/      per-phase runners + committed baselines, gated in CI
scripts/         bootstrap, branch protection, benchmark comparison
.opencode/       agent commands, subagents, live build state
AGENTS.md        standing orders for OpenCode sessions working in this repo
```

---

## Documentation

| Doc | Covers |
| --- | --- |
| [`docs/PRD.md`](docs/PRD.md) | Identity, architecture principles, ports, non-goals, milestones |
| [`docs/PHASED_PLAN.md`](docs/PHASED_PLAN.md) | Per-phase deliverables, tests, and benchmarks |
| [`docs/RESEARCH_AND_DISCUSSION.md`](docs/RESEARCH_AND_DISCUSSION.md) | The evidence base — including caveats on claims that didn't survive verification |
| [`docs/PROJECT_OVERVIEW.md`](docs/PROJECT_OVERVIEW.md) | Full repo layout, port contracts, domain types, config |
| [`docs/HARNESS_INSPIRATIONS.md`](docs/HARNESS_INSPIRATIONS.md) | What was adopted from, and deliberately rejected from, `claude-code-harness` |
| [`docs/adr/`](docs/adr/) | Architecture Decision Records — the "why," not just the "what" |

---

## Acknowledgments

Several security and process patterns — fail-closed policy evaluation, a non-overridable runtime floor, and the principle that the same capability name can carry different enforcement strength across adapters — were adapted from [claude-code-harness](https://github.com/Chachamaru127/claude-code-harness) by [Chachamaru127](https://github.com/Chachamaru127). See [`docs/HARNESS_INSPIRATIONS.md`](docs/HARNESS_INSPIRATIONS.md) for exactly what was adopted, adapted, or rejected, and why.

---

<div align="center">

🔨 **Forge is pre-release.**

Phases 0–7 are merged. Phase 7 (capability isolation) is done; the v1.0.0 release point has been reached.
No version has been published to npm yet.

**Star the repo to follow along.**

</div>

---

## License

Apache 2.0 — see [LICENSE](LICENSE).