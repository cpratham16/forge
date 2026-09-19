# Forge — Inspirations from claude-code-harness (verified)

Source: https://github.com/Chachamaru127/claude-code-harness (MIT, ~3.1k stars,
1,445 commits, 184 releases, Go-native guardrail engine). Primary sources read:
repo `README.md` and `docs/hardening-parity.md`.

This document is the **analyzed** version of a list of inspirations. Everything
below is marked as verified against primary sources, unverified, or rejected —
and for rejected items, why. Do not implement from an unverified row without
checking the source first. That discipline is the same one applied in
`RESEARCH_AND_DISCUSSION.md` Part 3, and for the same reason.

---

## Part 1: Corrections to the original inspiration list

| Claim as originally written | Status | Correction |
|---|---|---|
| Guardrails "R01–R16" | ❌ Wrong number | `docs/hardening-parity.md` states **R01–R13**, plus a separate runtime floor |
| Non-overridable runtime floor | ✅ Verified | Real. Concrete chain: `host native hook → bin/harness hook pre-tool → runtimefloor + R01–R13 policy → exit 2 + host deny envelope` |
| Host adapter tier system | ✅ Verified | Real, and richer than described: `supported` / `internal-compatible` / `candidate` / `future/unsupported` |
| Breezing = "lead spawns teammates with separate file ownership" | ⚠️ Partly | README describes Breezing as **Planner/Critic/Worker style team execution**, "still gated by plan quality and review". Separate file ownership is a reasonable design inference, not a documented CCH feature |
| Plan→Work→Review→Sync→Release, 5 stages | ⚠️ Slightly off | README's loop is **Investigate → Plan → Work → Review → PR → Release** (6 rows), with five *verb skills*: plan, work, review, sync, release |
| Three single-screen HTML views | ❓ Unverified | Not found in README or the docs index. Also collides with a PRD non-goal — see Part 4 |
| Machine-checked README | ❓ Unverified | Not found as a documented CCH feature. The idea still has merit on its own — see Part 3 |
| "Phase 7" (items 2.1) | ⚠️ Corrected since | This row predates the Phase 7 extension. Forge's roadmap now **does** include a Phase 7 — capability isolation + v1.0 gate closure (`PHASED_PLAN.md` Phase 7, `PRD.md` §11 extension note). `ContextPort` is **Phase 3**; it is not the thing the earlier "no such phase" verdict referred to |

---

## Part 2: What the original list missed (highest-value findings)

These came out of `docs/hardening-parity.md` and are stronger than most of what
the original list captured.

### 2.1 Fail-closed enforcement — CRITICAL

CCH's docs flag that a non-exit-2 response **can become fail-open** — i.e. a
policy check that errors, times out, or returns something unexpected silently
permits the action it was supposed to block.

**Why this matters more than it looks:** Forge's entire policy story is a
decorator around `ToolPort`. A decorator that throws, times out, or returns
malformed data is exactly the fail-open case. A security control that fails
open is worse than no control, because it produces false confidence.

**Forge rule:** `PolicyPort` evaluation failure of any kind — exception,
timeout, malformed `PolicyDecision`, unreachable policy process — MUST resolve
to `deny`. Never `allow`. This needs a dedicated test that injects each failure
mode and asserts the tool never executed.

### 2.2 "False parity is forbidden"

CCH's sharpest idea, and the original list flattened it into "adapter tiers."
The actual rule: the same capability name can have materially different
enforcement strength on different hosts, and the docs forbid presenting them as
equivalent. CCH's own capability matrix explicitly records that Cursor "can deny
but cannot be relied on for containment," and that one host is outside the
shared floor entirely.

**Why this matters for Forge:** "model-agnostic" and "every layer replaceable"
are Forge's headline claims (`PRD.md` §1, §5). Both create exactly this trap. If
the `shell` tool adapter enforces a path jail and a hypothetical remote-exec
adapter does not, presenting both as "implements `ToolPort`" is a lie by
omission — and it's the kind of lie that gets someone owned.

**Forge rule:** contract conformance is not binary. An adapter declares which
guarantees it actually enforces; the CLI surfaces that; nothing claims parity it
hasn't demonstrated.

### 2.3 "not_observed != absent"

From CCH's README: missing local proof means "not proven here" — not
"impossible," and not "supported."

**Why this matters for Forge:** this project has already been burned by exactly
the inverse error. `RESEARCH_AND_DISCUSSION.md` Part 3 documents a benchmark
that couldn't be verified, a paper statistic attributed to the wrong model, and
a disputed headline figure — all of which had been written as settled fact. This
principle is the general form of the fix.

**Forge rule:** `VerificationResult.status` gets a third state. `verified` /
`failed` / **`not_observed`** — the last meaning the check did not run or
produced no evidence. `not_observed` must never be counted as a pass, and must
never be silently rendered as a fail either.

### 2.4 The concrete policy matrix

CCH's actual default deny/confirm rows, worth copying because they're
battle-tested rather than invented:

| Policy | Example | Severity |
|---|---|---|
| No verification bypass | `git commit --no-verify` | Deny |
| Protected branch destructive reset | `git reset --hard main` | Deny |
| Direct push to protected branch | `git push origin main` | Confirm/Deny |
| Force push | `git push --force` | Deny |
| Protected files editing | `package.json`, workflows, `Dockerfile`, `schema.prisma` | Warn/Fail |
| Pre-push secrets scan | token-like string | Deny |

Note the deliberate design choice: protected files **warn**, they don't deny,
because legitimate changes exist. Secrets and `.env` deny via a separate,
stricter rule.

**Immediate finding about this repo:** Forge's own `opencode.json` already
denies force-push and direct pushes to `main`/`develop`, but has **no rule for
`git commit --no-verify`** — the single highest-severity row in CCH's matrix,
and the one that would let an agent bypass every local hook in this repo's own
gate. That's a real gap in Forge's existing automation, not a hypothetical.

---

## Part 3: Accepted — what to build, and where

Ordered by value-to-effort. Phase numbers refer to `PHASED_PLAN.md`.

| # | Feature | Phase | Notes |
|---|---|---|---|
| A1 | Fail-closed policy evaluation | 3 | Part 2.1. Non-negotiable. Test each failure mode. |
| A2 | `RUNTIME_FLOOR` — non-overridable deny list | 3 | Compiled into core, checked **before** the configurable engine, not loadable from `forge.yaml` |
| A3 | `not_observed` verification state | 3 | Part 2.3. Touches `VerificationResult` in `contracts` |
| A4 | Default policy rule set (R01–R13 equivalent) | 3 | Part 2.4. Ship defaults, allow project override — but override can never reach below the floor |
| A5 | `ReadinessLevel`: `draft` / `pr-ready` / `release-ready` | 3 | "PR-ready is not release-ready." Cheap, high clarity |
| A6 | `StopCondition[]` on `Task` | 3 | Bounds retry loops. Orchestrator checks before every retry |
| A7 | Blocking vs non-blocking review findings | 4 | `ReviewResult`; only blocking findings prevent DONE |
| A8 | Drift detection → `DriftReport` | 4 | See below — this is more valuable than the source realized |
| A9 | `PolicyGrant` (scoped, plan-time approval) | 3 | Avoids approval fatigue without weakening the floor |
| A10 | `fileOwnership` on `AgentSpec`, enforced in `ToolPort` decorator | 4 | Makes concurrent agents structurally conflict-free |
| A11 | Adapter conformance declaration (not just a tier) | 2, 5 | Part 2.2. An adapter states which guarantees it enforces |
| A12 | Human-readable trace summary alongside JSONL | 3 | `forge trace show <run-id>` |
| A13 | Claims-test pattern for README | 0 | Unverified as a CCH feature, but cheap and fits this repo's evidence culture |

### Why A8 (drift) is worth more than the source suggests

`PRD.md` §12 asks an open question: how do you measure orchestration quality
without an LLM judge that itself has harness-dependent variance?

Drift is a partial answer. The gap between the plan's declared task list and the
tasks actually completed is **mechanically computable from trace data** — no
judge, no model call, no variance. That makes it a real, cheap input to the
internal OQS scorer's Coordination dimension, rather than another
LLM-scores-LLM loop. Build `DriftReport` as a trace projection and feed it to
the scorer.

---

## Part 4: Rejected, and why

### R1 — Mandatory five-stage Plan→Work→Review→Sync→Release pipeline

**Rejected as the core loop.** CCH is a monolithic, opinionated workflow; that's
its design and it works for it. Forge's #1 ranked differentiator (`PRD.md` §8)
is *adaptive orchestration* — task complexity generating the workflow graph
dynamically, where a small task gets a single agent and a complex one gets a
full topology (`PHASED_PLAN.md` Phase 6). Hard-coding a mandatory five-stage
pipeline into the core would contradict the product's central claim.

**Adopted instead:** ship it as a **named workflow preset** (`disciplined-v1`)
selectable in `forge.yaml`, sitting alongside `adaptive`. Users who want CCH-style
discipline get it; the runtime doesn't mandate it. This keeps the idea and the
architecture.

### R2 — Three single-screen HTML stakeholder views

**Rejected for v1.** Unverified in the source, and directly collides with
`PRD.md` §9, which lists "web dashboard" as an explicit non-goal, and with
`PHASED_PLAN.md`'s cross-phase list ("no web dashboard before CLI users"). A
`ReporterPort` producing static markdown is the in-scope version; HTML rendering
can live in a separate package post-v1 if anyone actually asks for it.

### R3 — `TaskContract` as a new parallel domain type

**Rejected as written.** `Task` already carries `objective`, `successCriteria`,
`inputs`, and `dependencies` (`PROJECT_OVERVIEW.md` §3). Adding a second,
overlapping contract type creates two sources of truth for what a task is —
the exact failure `RESEARCH_AND_DISCUSSION.md` Part 5 criticizes elsewhere.

**Adopted instead:** extend `Task` with the fields it's actually missing —
`scope: { in: string[]; out: string[] }`, `stopConditions`, and
`estimatedComplexity` — and add an `approvalState`. One type, not two.

### R4 — `TaskLedger` as a separate store

**Rejected as a separate store.** Forge is trace-first by principle (`PRD.md`
§5): every state transition is already a `TraceEvent`. A second ledger that
records the same transitions is a second source of truth that will drift from
the first.

**Adopted instead:** `TaskLedger` is a **read-model projected from trace
events**, not a store that's written to independently. Same information, one
writer.

---

## Part 5: Where Forge deliberately differs from CCH

| Dimension | CCH | Forge |
|---|---|---|
| Architecture | Monolithic Go engine | Hexagonal ports & adapters |
| Workflow | Mandatory disciplined pipeline | Adaptive graph; discipline available as a preset |
| Enforcement | Centralized, host-native hooks | Composable decorators + a non-overridable floor |
| Orchestration quality | Not a focus | First-class, measured, and fed back into the harness |
| Host coupling | Claude Code first, others tiered | Model-agnostic via `ModelProvider` |

CCH demonstrates that there's real demand for disciplined harnesses, and its
safety engineering is more mature than Forge's current plan. Forge's opportunity
isn't to copy the workflow — it's to make the same discipline **measurable and
composable** rather than fixed.
