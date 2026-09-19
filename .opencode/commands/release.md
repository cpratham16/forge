---
description: Open (and, only with explicit confirmation, merge) the develop → main release PR
agent: build
---

Prepare a release: `develop` → `main`.

Current state:

!`cat .opencode/STATE.md`

!`git log main..develop --oneline`

This is the one workflow step in this project that is **never fully
autonomous** — see @AGENTS.md §8. Do the following, and stop where indicated:

1. Confirm every phase merged into `develop` since the last release shows
   `Gate result: PASS` in STATE.md's Phase Ledger. If any row is missing a
   PASS, stop and report which one — do not proceed.
2. Determine which release this is: `v0.1.0` if this is the first release
   (post-M12, per `docs/PRD.md` §11), `v1.0.0` if it's post-Phase-7, otherwise
   ask the user what version this should be.
3. Summarize for the human, in chat, before touching git:
   - Every phase/PR included since the last release
   - The accumulated benchmark deltas across those phases (pull from STATE.md's
     Benchmark Baselines table)
   - Anything in `docs/PRD.md` §12 Open Questions that's still open and
     relevant to this release
4. **Stop and explicitly ask the user to confirm this release**, even if
   everything above looks clean. Do not proceed to step 5 without an explicit
   yes in this session.
5. Only after confirmation: delegate to `pr-manager` to
   `gh pr create --base main --head develop --title "Release <version>"` with
   the summary from step 3 as the body, then `gh pr checks --watch`, then —
   again only after the checks are green **and** you've confirmed with the
   user one more time that this specific PR should be merged now — merge it.
6. Update STATE.md's Releases table with the version, PR link, and date.
7. If this release is v0.1.0, remind the user `docs/PRD.md` M12 also calls for
   publishing `@forge/cli` to npm — that's a separate, explicit `npm publish`
   step (denied by default in `opencode.json`, so it'll prompt) and is not
   implied by the git merge alone.
