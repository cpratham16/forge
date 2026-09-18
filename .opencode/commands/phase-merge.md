---
description: Merge the current phase's PR into develop, but only if required checks are green
agent: pr-manager
subtask: true
---

Merge the open PR for this phase into `develop` — conditionally.

Current state:

!`cat .opencode/STATE.md`

1. Identify the open PR from STATE.md (or `gh pr view --json number,url` on
   the current branch if STATE.md is stale).
2. `gh pr checks <number>`. Read the actual output — every required check
   (`test`, and `benchmark-gate` if this phase defines a benchmark) must show
   `success`. Anything else (`pending`, `failure`, `skipped` on a required
   check) means **do not merge**.
   - If checks are still pending: report status and stop. Don't loop-poll
     forever in one turn — tell the user to re-run `/phase-merge` shortly, or
     watch with `gh pr checks <number> --watch` if asked to wait.
   - If a required check failed: report which one and why (pull the log via
     `gh run view` if useful), and stop. The fix happens back on the `build`
     agent, on the same phase branch — not here.
3. If and only if all required checks are `success`:
   - `gh pr merge <number> --squash --delete-branch`
   - `git checkout develop && git pull origin develop`
   - Update `.opencode/STATE.md`: Phase Ledger row → `Status: merged`,
     `Gate result: PASS`, record the merge commit SHA; clear Current; append
     a Change Log line.
   - If this phase has a benchmark, copy its result file to
     `benchmarks/results/phase-<N>.json` as the new baseline for the next
     phase's `/phase-verify`, and update the Benchmark Baselines table in
     STATE.md with the actual numbers.
   - Say which phase is next per the Phase Ledger, but don't start it — that's
     a separate `/phase-start`.
