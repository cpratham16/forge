---
description: Bring the current phase branch up to date with develop and re-run tests
agent: build
---

Sync the current phase branch with the latest `develop`.

!`git status --short --branch`

1. `git fetch origin`
2. `git merge origin/develop` (prefer merge over rebase here — phase branches
   can be long-running and shared context matters more than a clean history;
   `git log` staying honest beats a rewritten one).
3. Resolve any conflicts. If a conflict touches a file outside the package(s)
   this phase owns per `docs/PHASED_PLAN.md`, flag it explicitly before
   resolving — that usually means two phases are touching the same file and
   `docs/PHASED_PLAN.md`'s "each phase touches exactly one port or adapter"
   assumption (see its header note) has been violated somewhere.
4. `pnpm install` (lockfile may have moved), then `pnpm test` to confirm the
   merge didn't break anything before continuing feature work.
5. Push: `git push origin <current branch>`.
