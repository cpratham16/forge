---
description: Commit, push, and open the PR for the current phase branch into develop
agent: pr-manager
subtask: true
---

Open the pull request for the current phase branch into `develop`.

Current state:

!`cat .opencode/STATE.md`

Current branch and diff summary:

!`git status --short --branch`

!`git log develop..HEAD --oneline`

Before doing anything: confirm you have a `VERIFIER REPORT` with
`Overall: PASS` from `/phase-verify` earlier in this session. If you don't,
stop and say so — don't open the PR without it.

If you do:

1. `git add -A && git commit` with a Conventional Commit message summarizing
   the phase's completed deliverables (skip if there's nothing uncommitted).
2. `git push origin <current branch>`.
3. `gh pr create --base develop --head <current branch> --title "<phase N: name>" --body "<summary paragraph + the full VERIFIER REPORT block + link to the docs/PHASED_PLAN.md section>"`.
4. `gh pr checks <number> --watch` and report back the result — don't merge,
   that's `/phase-merge`.
5. Update `.opencode/STATE.md`: Status → `pr-open`, record the PR number/URL.
