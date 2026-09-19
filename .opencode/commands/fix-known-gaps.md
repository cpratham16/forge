---
description: Fix every gap found in the 2026-09-19 production-readiness audit — npm name collision, missing LICENSE, ADR numbering collision, stale README, CODEOWNERS placeholder, unexercised benchmark gate, missing optional files. Run once.
agent: build
---

This fixes specific, verified findings from an audit of this exact repo at
commit `1a93127` (develop). Each item below was independently confirmed by
cloning the repo and running the real toolchain — not inferred from docs.
Work through all of them; they're independent, so order only matters within
each item.

Read first: @AGENTS.md, @.opencode/STATE.md.

## 1. npm package name collision — do this first, it's the real blocker

`@forge/cli` (and the whole `@forge/*` scope) is already owned by Atlassian —
their CLI for their own product also called Forge, published since 2019,
currently v14. This blocks real `npm publish` at M12. Verified available as of
this audit: the `@runforge` scope, across `cli`, `core`, `contracts`, and
`adapters`.

- Rename every package: `@forge/contracts` → `@runforge/contracts`,
  `@forge/core` → `@runforge/core`, `@forge/adapters` → `@runforge/adapters`,
  `@forge/cli` → `@runforge/cli`.
- **The product name stays "Forge."** Only the npm scope changes. The CLI
  binary stays named `forge` (that's the `bin` field's key, not the package
  name — no collision risk there, it's just a local PATH entry).
- Grep the whole repo for the literal string `@forge/` and update every
  occurrence: all four `package.json` `name` and `dependencies` fields, any
  TypeScript import statements, `docs/PRD.md`, `docs/PROJECT_OVERVIEW.md`
  (directory tree, CLI/SDK examples), `docs/PHASED_PLAN.md`,
  `AGENTS.md` and the four `packages/*/AGENTS.md` files, `README.md` if you
  edit it before I hand you the new one (see item 7), and `.npmignore`/
  `package.json` `bin`/`exports` fields.
- After the rename: `pnpm install`, `pnpm build`, `pnpm test` — confirm
  nothing broke from the cross-package `workspace:*` references changing name.
- Verify again before you consider this done: re-check
  `https://registry.npmjs.org/@runforge%2Fcli` returns 404 (still unclaimed) —
  don't just trust this file's earlier check, confirm it yourself, since time
  has passed.

## 2. Missing LICENSE — the repo currently has none

`docs/PRD.md` states Apache 2.0, `package.json` doesn't even declare a
`license` field, and there is no `LICENSE` file in the repo at all — meaning
nothing in this repo is actually licensed for use right now, regardless of
what the docs claim.

- Add a real `LICENSE` file at the repo root with the standard Apache License
  2.0 text (use the canonical text from https://www.apache.org/licenses/LICENSE-2.0.txt,
  with the copyright line filled in for the actual repo owner and year).
- Add `"license": "Apache-2.0"` to the root `package.json` and all four
  `packages/*/package.json` files.

## 3. ADR numbering collision

`docs/adr/002-fail-closed-policy.md` collides with the pre-existing
`docs/adr/002-trace-first-architecture.md`; same collision at 003. These
landed in parallel branches that each independently picked "the next number"
without checking a shared registry — which is exactly how it happened.

- Renumber, don't just re-title: `002-fail-closed-policy.md` →
  `011-fail-closed-policy.md` (update the in-file `# ADR-002:` heading to
  `# ADR-011:` too — the filename and the heading must agree). Same for
  `003-no-false-parity.md` → `012-no-false-parity.md` / `# ADR-012:`.
  (011/012, not 005/006 — `docs/PROJECT_OVERVIEW.md` §9's original table
  already reserves 005–010 for topics that haven't been written yet;
  reusing one of those numbers now just relocates the same collision to
  whenever those get written.)
- Update `docs/PROJECT_OVERVIEW.md` §9's ADR table: add rows for ADR-011 and
  ADR-012, so that table is genuinely the registry of every ADR number in
  use, not just the originally-planned ten.
- Fix any other reference to "ADR-002: Fail-Closed" or "ADR-003: No False
  Parity" elsewhere (grep for it — likely in `docs/HARNESS_INSPIRATIONS.md`
  and `.opencode/commands/integrate-harness-inspirations.md`).
- Add one line to `AGENTS.md` (near the architecture rules in §2): before
  writing a new ADR, check `docs/PROJECT_OVERVIEW.md` §9 for the next free
  number — don't just look at the highest filename in `docs/adr/`, since two
  branches can do that in parallel and collide, which is exactly what happened
  here.

## 4. CODEOWNERS still has the literal placeholder

`CODEOWNERS` at the repo root still says `@OWNER` verbatim in every rule — as
written, none of these rules actually resolve to a real GitHub user.

- Replace every `@OWNER` with `@cpratham16`.
- Fix the stale reminder text in `scripts/bootstrap.sh` — it says "Replace
  @OWNER in `.github/CODEOWNERS`" but the file lives at root `CODEOWNERS` now,
  not `.github/CODEOWNERS`. Update the path in the printed message (or move
  the file back under `.github/` if you'd rather standardize there instead —
  either location is valid to GitHub; pick one and make the script's message
  match reality).

## 5. README status line never gets updated — fix the mechanism, not just the text

I'm giving you a rewritten `README.md` separately. Before you drop it in,
build the thing that would have caught this: a claims-test, per
`docs/HARNESS_INSPIRATIONS.md` item A13, which was planned for Phase 0 and
never actually built.

- Add `scripts/check-readme-claims.mjs`: parse the `Phase` value out of
  `.opencode/STATE.md`'s `## Current` table, parse the phase number out of
  `README.md`'s status line, and fail (non-zero exit, clear message) if they
  don't match.
- Add a `pnpm check-claims` script in root `package.json` running it.
- Add a step calling it in `.github/workflows/ci.yml`, and reference it as a
  required part of `/phase-merge`'s gate in `.opencode/commands/phase-merge.md`
  (a phase can't merge if the README's status line wasn't updated to match).
- This only checks the one claim that's actually drifted so far. Leave a
  comment in the script noting it's a starting point, not exhaustive — extend
  it if another claim drifts later, per the same evidence-based-completion
  principle as everything else in this repo.

## 6. Benchmark regression gate has barely been exercised

`benchmarks/results/phase-3.json` and the original `phase-4.json` were never
committed when they needed to be, so at least Phase 4's merge almost certainly
passed via `benchmark-gate.yml`'s "no baseline found → pass" fallback rather
than a real numeric comparison. That fallback is only supposed to fire once
— when phase 2 establishes the very first baseline — not on every later phase
that happens to be missing its predecessor.

- Backfill `benchmarks/results/phase-3.json` for the audit trail: run
  `pnpm bench:phase -- --phase 3 --out benchmarks/results/phase-3.json` and
  commit the result.
- Generate and commit `benchmarks/results/phase-5.json` the same way — Phase 6
  needs a real predecessor baseline, and right now it doesn't have one.
- Fix `.github/workflows/benchmark-gate.yml`'s fallback logic: the "no
  baseline yet" pass-through should only apply when the *missing* baseline is
  phase 1 or earlier (i.e., phase 2's own run, which has nothing to compare
  against by design). For phase 3 onward, a missing predecessor baseline
  should **fail** the check with a clear message telling whoever's looking at
  it to backfill it — not silently pass. This is the fix that prevents this
  exact gap from recurring.

## 7. Optional files that went missing — restore one, skip the other

- Restore `.github/workflows/opencode.yml` (the official OpenCode GitHub
  Action wiring) — it's still useful going forward.
- `.opencode/commands/bootstrap.md` doesn't need restoring — its one-time job
  (auditing the unverified Phase 0 scaffold) is done, and STATE.md already
  records that it happened. Re-adding it as-is risks a future session running
  it and re-auditing Phase 0 as if nothing has happened since.

## When you're done

Report: the new package names (confirm the npm availability re-check from
item 1 actually passed), whether the rename broke anything, the LICENSE file
added, the two ADRs renumbered, CODEOWNERS fixed, the claims-test added and
wired into CI, the two backfilled benchmark baselines, and the
benchmark-gate.yml fallback fix. Do all of this on a single
`chore/fix-known-gaps` branch off `develop`, run `/phase-verify` before
opening the PR, and follow the normal `/phase-pr` → `/phase-merge` flow — this
is exactly the kind of change that gate exists for.
