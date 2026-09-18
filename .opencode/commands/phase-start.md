---
description: Branch a new phase off develop and load that phase's context
agent: build
---

Start phase **$1** of Forge.

Phase → branch slug lookup (use exactly these, don't improvise a new slug):

| N | slug |
|---|---|
| 0 | phase/0-foundation |
| 1 | phase/1-contracts-types |
| 2 | phase/2-adapter-kernel |
| 3 | phase/3-tools-verification-context-trace |
| 4 | phase/4-agent-oqs |
| 5 | phase/5-npm-self-improvement |
| 6 | phase/6-adaptive-orchestration |

Current state:

!`cat .opencode/STATE.md`

Current git status:

!`git status --short --branch`

Do this, in order:

1. Check the Phase Ledger above. If phase `$1 - 1`'s row does not show
   `Status: merged` and `Gate result: PASS` (Phase 0 has no predecessor —
   skip this check for it), **stop and ask the user** whether they really
   want to start phase $1 out of order before doing anything else.
2. `git fetch origin`, `git checkout develop`, `git pull origin develop`.
3. `git checkout -b <slug for $1>` from the table above.
4. Push the empty branch: `git push -u origin <slug>`.
5. Read the phase's own section in @docs/PHASED_PLAN.md — its Goal,
   Deliverables, Tests, Benchmark, and References — and summarize it back so
   we both know what "done" means for this phase before writing code.
6. Update `.opencode/STATE.md`: set Current → Phase/Branch/Status
   (`in-progress`), update the Phase Ledger row for $1, append a Change Log
   line (`YYYY-MM-DD — started phase $1 on <slug>`).
7. Commit that STATE.md update on the new branch: `chore(state): start phase $1`.

Then wait for further instructions before implementing anything — starting a
phase is a distinct step from doing the phase's work.
