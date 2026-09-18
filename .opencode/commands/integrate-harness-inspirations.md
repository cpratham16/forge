---
description: Fold the verified claude-code-harness inspirations into the Forge plan and contracts, phase by phase. Run once, after Phase 1 is underway.
agent: build
---

Integrate the accepted items from @docs/HARNESS_INSPIRATIONS.md into this
project. That document is already researched and verified against primary
sources — treat its Part 3 (accepted), Part 4 (rejected), and the corrections
in Part 1 as decided. Do not re-litigate them, and do not implement anything
from Part 4.

Read first, in order: @AGENTS.md, @.opencode/STATE.md,
@docs/HARNESS_INSPIRATIONS.md, then @docs/PHASED_PLAN.md and
@docs/PROJECT_OVERVIEW.md.

## Ground rules for this work

- **This is mostly a docs-and-contracts change, not an implementation sprint.**
  Most accepted items land in Phase 3 or 4, which haven't started. Your job is
  to make sure they're *specified* in the right phase so they get built there —
  not to build Phase 3 now.
- **Respect the dependency rule.** New types go in `packages/contracts` (pure
  types, zero deps). Nothing here justifies an exception.
- **One PR per logical group**, on the current phase branch or a dedicated
  `chore/harness-inspirations` branch off `develop`. Follow AGENTS.md §5–§7 as
  normal: verifier PASS before `/phase-pr`, green required checks before merge.
- If something in `HARNESS_INSPIRATIONS.md` contradicts what's actually on
  disk, stop and tell me rather than guessing which one is right.

## Work item 1 — Fix this repo's own policy gap (do this first, it's real)

`docs/HARNESS_INSPIRATIONS.md` Part 2.4 found that `opencode.json` blocks force
pushes and direct pushes to `main`/`develop`, but has no rule against
`git commit --no-verify` — which would let a session bypass every local hook in
our own gate. That's the highest-severity row in CCH's matrix and it's missing
here.

Add to `opencode.json`, in both the global `permission.bash` block and the
`build` agent's block:

- `"git commit --no-verify*": "deny"`
- `"git commit -n *": "deny"`
- `"git push --no-verify*": "deny"`

Then check whether `pr-manager`'s allowlist has the same hole (it allows
`git commit*` broadly) and close it the same way.

## Work item 2 — Contracts additions (`packages/contracts`)

Add these to the appropriate files under `src/domain/` and `src/ports/`, and
mirror every one of them into `docs/PROJECT_OVERVIEW.md` §2/§3 so the doc and
the code stay in sync:

1. `VerificationResult.status` gains a third state: `'not_observed'`. Document
   at the type that it must never be counted as a pass, and must not be
   silently rendered as a fail either (Part 2.3).
2. `ReadinessLevel = 'draft' | 'pr-ready' | 'release-ready'` on
   `VerificationResult`.
3. `StopCondition` and `Task.stopConditions: StopCondition[]`.
4. Extend `Task` — do **not** create a parallel `TaskContract` type (Part 4, R3):
   add `scope: { in: string[]; out: string[] }`, `estimatedComplexity:
   'LOW' | 'MEDIUM' | 'HIGH'`, and `approvalState: 'draft' | 'approved' | 'rejected'`.
5. `ReviewResult` with `blockingFindings` and `nonBlockingFindings`.
6. `DriftReport` + `DriftType`.
7. `PolicyGrant` (scoped plan-time approval).
8. `AgentSpec.fileOwnership: string[]`.
9. `AdapterConformance` — what guarantees an adapter actually enforces, not a
   single tier label (Part 2.2).

Update the type-level tests so each new type is covered.

## Work item 3 — Phase plan updates (`docs/PHASED_PLAN.md`)

Add these as explicit deliverables **with tests**, in the phases
`HARNESS_INSPIRATIONS.md` Part 3 assigns:

**Phase 3** — A1 through A6, A9, A12:
- Fail-closed `PolicyPort` evaluation. Add a named test: inject exception,
  timeout, and malformed `PolicyDecision`, and assert in each case that the
  underlying tool **never executed**. This one is non-negotiable (Part 2.1).
- `RUNTIME_FLOOR` — a non-overridable deny list in core, evaluated *before* the
  configurable rule engine, not loadable from `forge.yaml`. Add a test that a
  `forge.yaml` attempting to permit a floor-denied action still results in deny.
- Default rule set modeled on CCH's matrix (Part 2.4): deny verification bypass,
  destructive reset on protected branches, force push, secrets in diffs; warn on
  protected-file edits; separate stricter deny for `.env` and key material.
- `not_observed` handling, `ReadinessLevel`, `StopCondition` enforcement in the
  retry path, `PolicyGrant`, human-readable trace summary.

**Phase 4** — A7, A8, A10:
- Blocking findings gate DONE.
- `DriftReport` as a **projection over trace events**, not a separate store
  (Part 4, R4) — and wire it into the internal OQS scorer's Coordination
  dimension. Note in the plan why: it's a judge-free orchestration signal, which
  is a partial answer to the open question in `PRD.md` §12.
- `fileOwnership` enforced in the `ToolPort` decorator.

**Phase 2 and 5** — A11: adapter conformance declaration, surfaced by the CLI.

**Phase 0/ongoing** — A13: claims-test pattern for README assertions.

Also add the `disciplined-v1` workflow preset (Part 4, R1) to **Phase 6**,
explicitly as a preset selectable in `forge.yaml` alongside `adaptive` — not as
a mandatory core pipeline.

## Work item 4 — PRD and ADRs

- `docs/PRD.md` §5: add fail-closed enforcement and the non-overridable runtime
  floor to the architecture principles. They're currently implied by
  "policy-native" but not stated, and Part 2.1 is too important to leave implied.
- `docs/PRD.md` §9: no change needed, but confirm the web-dashboard non-goal
  still reads clearly — it's the basis for rejecting R2.
- Write `docs/adr/002-fail-closed-policy.md` from the ADR template. This is a
  real architectural decision with real consequences and deserves its own record.
- Write `docs/adr/003-no-false-parity.md` covering Part 2.2 — adapters declare
  the guarantees they enforce; the runtime never presents unequal enforcement as
  equivalent.

## Work item 5 — Adopt the epistemic rule in AGENTS.md

`AGENTS.md` §11 already tells you to verify external claims against primary
sources. Extend it with the general form from Part 2.3: **"not observed" is not
"absent."** When a check doesn't run, say it didn't run. Don't report it as a
pass, and don't report it as a failure. This applies to your own verifier
reports as much as to the code.

## When you're done

Report: which contracts changed, which phases gained deliverables, which ADRs
you wrote, the `opencode.json` gap you closed, and anything in
`HARNESS_INSPIRATIONS.md` you couldn't apply cleanly and why. Then stop — don't
start implementing Phase 3 itself.
