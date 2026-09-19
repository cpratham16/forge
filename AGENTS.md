# Forge — Standing Orders for OpenCode

This file is auto-loaded by OpenCode at the start of every session (see
https://opencode.ai/docs/rules/). It is the single always-on contract. Everything
else in `.opencode/` (commands, subagents) exists to *operationalize* the rules
written here — if a command's behavior and this file ever disagree, this file wins.

Read this fully before doing anything else. Then read `.opencode/STATE.md` —
it tells you where the project actually is right now.

---

## 1. What this project is

Forge is being built exactly as specified in `docs/`:

- `docs/PRD.md` — identity, architecture principles (§5), non-goals (§9), milestones (§11)
- `docs/PHASED_PLAN.md` — the 7 phases (0–6): goal, deliverables, tests, benchmark, references, per phase
- `docs/RESEARCH_AND_DISCUSSION.md` — evidence, caveats on disputed claims, what to build vs. compose
- `docs/PROJECT_OVERVIEW.md` — repo layout, port contracts, domain types, dependency rules, config

These four files are the source of truth for *what* to build. This file is the source
of truth for *how* to work: session discipline, git, PRs, and merge gates. Don't
duplicate content between them — if you need the deliverables for a phase, open
`docs/PHASED_PLAN.md`; don't ask the user to repeat it.

## 2. Non-negotiable architecture rules (from PRD.md §5 / PROJECT_OVERVIEW.md §4)

- `packages/contracts` has zero dependencies. Pure types. No logic.
- `packages/core` never imports from `packages/adapters` or any external SDK.
- Every new port gets a contract test suite run first against a mock adapter, then
  against the real adapter, before the real adapter is considered done.
- `dependency-cruiser` is the mechanical enforcer of the above — if you're not sure
  whether an import is allowed, run `pnpm dep-check` before writing it, don't guess.
- Non-goals in `docs/PRD.md` §9 are load-bearing. If a task starts to look like
  "build our own LLM / vector DB / benchmark runner / trace format", stop and
  re-read that section instead of proceeding.
- Evidence-based completion: a task is only "done" when the runtime — tests,
  dependency-cruiser, the phase's benchmark gate — says so. Your own statement
  that something works is not evidence. Never mark a milestone complete in
  `.opencode/STATE.md` on the basis of your own read of the code; only on the
  basis of a command actually being run and passing.

## 3. Session startup protocol

Every session, in order:

1. Read `.opencode/STATE.md`. It tells you the current phase, current branch,
   and gate status. Do not start new work on a phase whose predecessor's gate
   is not `PASS` in STATE.md, unless the user explicitly overrides this.
2. If you're about to touch a package for the first time this session, read
   that package's own `AGENTS.md` if one exists (OpenCode loads nested
   `AGENTS.md` files automatically as you read/list files under them — see
   https://opencode.ai/v2/docs/instructions/). Don't assume the root file is
   the whole picture once you're inside `packages/*`.
3. If you don't already know the current phase's deliverables/tests/benchmark,
   open `docs/PHASED_PLAN.md` and read that phase's section before writing code.
   Use `/phase-start` (see §6) to do this properly rather than freehanding it.

## 4. Coding standards

- TypeScript, strict mode, pnpm workspaces — see `docs/PROJECT_OVERVIEW.md` §1/§4/§5
  for the full layout and dependency rules.
- Package scripts this automation depends on (create these in Phase 0 if they
  don't exist yet — do not invent different script names, the CI workflows and
  commands in this repo call these exact names):

  | Script | Purpose |
  |---|---|
  | `pnpm lint` | eslint |
  | `pnpm dep-check` | dependency-cruiser against `.dependency-cruiser.cjs` |
  | `pnpm typecheck` | `tsc -b --noEmit` across the workspace |
  | `pnpm test` | vitest, all packages |
  | `pnpm bench:phase -- --phase <N>` | runs the current phase's benchmark (may shell out to Harbor — see `docs/PHASED_PLAN.md` Phase 3 correction: Harbor is a **Python CLI**, invoke it via subprocess, don't try to `npm install` it) |

- Commit messages: Conventional Commits, scoped to the touched package, and
  tagged with the phase/milestone: `feat(core): single-agent loop (phase-2, M4)`.

## 5. Git & branch strategy

```
main                                ← production. Protected. PR from develop only.
 └─ develop                         ← integration branch. Protected. PR from phase/* only.
     ├─ phase/0-foundation
     ├─ phase/1-contracts-types
     ├─ phase/2-adapter-kernel
     ├─ phase/3-tools-verification-context-trace
     ├─ phase/4-agent-oqs
     ├─ phase/5-npm-self-improvement
     ├─ phase/6-adaptive-orchestration
     └─ phase/7-capability-isolation-v1
```

Rules:

- **Never commit directly to `main` or `develop`.** Every change lands via a PR
  from a `phase/*` branch into `develop`, or from `develop` into `main`.
- One branch per phase, branched from the tip of `develop`, named exactly as
  in the table above. If a phase's milestones genuinely need isolation from
  each other (rare — most milestones are sequential commits on the same phase
  branch), branch further as `phase/3-tools-verification-context-trace/m7-context-port`
  and PR that into the phase branch instead of into `develop`.
- `develop` moves forward only through green phase-branch PRs. `main` moves
  forward only through green `develop` PRs, opened at defined release points
  (currently: after M12 for `v0.1.0`, and after Phase 7 for `v1.0.0` — see
  `docs/PRD.md` §11).
- Never force-push `main` or `develop`. Force-pushing a `phase/*` branch to
  clean up your own history before opening a PR is fine.
- Keep phase branches reasonably in sync with `develop` (`/sync-develop`) —
  don't let one drift for the whole phase and then face a giant conflict at
  PR time.

## 6. The phase workflow, as commands

Use these instead of improvising the same sequence by hand — they encode the
exact steps and the exact gate logic:

| Command | Does |
|---|---|
| `/phase-start <N>` | Branches `phase/N-...` off `develop`, loads that phase's section of `docs/PHASED_PLAN.md`, updates STATE.md |
| `/phase-verify` | Runs the `verifier` subagent: lint, dep-check, full test suite, and the phase's benchmark (if it has one) against the stored baseline. Reports PASS/FAIL. Cannot edit code. |
| `/phase-pr` | Commits, pushes, opens the PR into `develop` via `gh`, with the verifier's report in the PR body |
| `/phase-merge` | Confirms required CI checks are green on GitHub (not just locally), merges, updates STATE.md, returns you to `develop` |
| `/sync-develop` | Merges latest `develop` into your phase branch and re-runs tests |
| `/release` | `develop` → `main`. Always asks for explicit human confirmation before merging — see §8 |

## 7. The merge gate — what "tests and benchmarks satisfied" actually means

A PR into `develop` may be merged only when **all** of the following are true.
This is enforced twice — once by you following this protocol, once
mechanically by GitHub branch protection (`scripts/setup-branch-protection.sh`)
so a rushed or mistaken session can't bypass it:

1. `pnpm lint`, `pnpm dep-check`, `pnpm typecheck`, `pnpm test` all pass in CI
   (`.github/workflows/ci.yml`, required status check `test`).
2. If the phase defines a benchmark in `docs/PHASED_PLAN.md` (Phases 2–6; Phases
   0–1 explicitly have none — don't invent one), the benchmark gate
   (`.github/workflows/benchmark-gate.yml`, required status check
   `benchmark-gate`) passes: no regression in pass@1 vs. the immediately
   preceding phase's stored baseline in `benchmarks/results/`, and cost/latency
   within the tolerance defined in `scripts/compare-benchmark.mjs`.
3. The `verifier` subagent's report (not your own summary) says PASS.
4. `docs/STATE.md`-equivalent (`.opencode/STATE.md`) has been updated to
   reflect what actually happened — not what was planned.

If any of these fail: **do not merge.** Fix it on the same phase branch, push
again, let CI re-run, try `/phase-verify` again. Never merge on the promise
that a failing check "should be fine" or "is unrelated" — if it's actually
unrelated and pre-existing, that itself is a bug to fix or a ticket to raise,
not a reason to bypass the gate.

## 8. `main` is different

Merging `develop` into `main` is the one action in this whole workflow that is
never fully autonomous. `/release`:

- Requires every phase gate since the last release to show PASS in STATE.md's
  change log.
- Summarizes the diff and the accumulated benchmark deltas for the human.
- Waits for explicit confirmation in chat before running `gh pr merge` on the
  `develop → main` PR, even if every CI check is green.

This is deliberate: `develop` accumulating an autonomous PR-merge loop is an
acceptable risk for an internal integration branch; publishing to `main` (and,
at M12+, to npm) is not something to fully hand off.

## 9. Roles (why there are three agent profiles, not one)

- **build** (default primary agent) — implements. Full edit access. Git/gh
  access is intentionally restricted (see `opencode.json`) so implementation
  work and merge authority aren't the same unrestricted session.
- **verifier** (subagent, `.opencode/agents/verifier.md`) — re-runs the gate
  independently. Cannot edit files. Exists so the agent that wrote the code
  isn't the same one certifying it's done — mirrors the plan's own "evidence-
  based completion, not self-declared done" principle (`docs/PRD.md` §5) at
  the process level, not just the runtime level.
- **pr-manager** (subagent, `.opencode/agents/pr-manager.md`) — handles git
  push / PR / merge. Cannot edit source files. `gh pr merge` is `ask`, not
  `allow`, even for this role — see §8.

## 10. If you get stuck

After a couple of failed attempts at the same gate, don't keep retrying the
same fix. Use the `question` tool to check in with the user, summarize what
you tried, and what you think the actual blocker is. Silently downgrading a
requirement (e.g. skipping a test, loosening a benchmark tolerance) to get a
gate to pass is not an acceptable way to get unstuck — that's the failure mode
`docs/RESEARCH_AND_DISCUSSION.md` Part 5 already describes as a flaw when the
project cuts a corner and hides it as if it were fine.

## 11. Epistemic rule: "not observed" is not "absent"

When a check doesn't run, say it didn't run. Don't report it as a pass, and
don't report it as a failure — "not observed" means exactly that: the evidence
wasn't produced. This applies to your own verifier reports, trace assertions,
and benchmark interpretations exactly as much as it applies to the code you write.

Additionally, if you add a new external claim, package,
or benchmark reference to any `docs/*.md` file, verify it against a primary
source first (web search / the actual registry / the actual paper) rather
than writing it from memory — the same discipline this project's own docs
were corrected under.
