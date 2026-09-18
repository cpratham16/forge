## Phase / Milestone

<!-- e.g. Phase 3 (M5–M9). Add the matching `phase:N` label or benchmark-gate cannot run. -->

## What this delivers

<!-- One paragraph. Link the relevant docs/PHASED_PLAN.md section. -->

## Verifier report

<!-- Paste the full VERIFIER REPORT block from /phase-verify. Not a summary of it. -->

```
VERIFIER REPORT
Phase:
Lint:
Dep-check:
Typecheck:
Tests:
Benchmark:
Overall:
Notes:
```

## Gate checklist

- [ ] `pnpm lint`, `pnpm dep-check`, `pnpm typecheck`, `pnpm test` pass in CI
- [ ] Benchmark gate passes, or phase has no benchmark defined (Phases 0–1)
- [ ] No dependency-cruiser rule was weakened to make this pass
- [ ] `.opencode/STATE.md` updated to reflect what actually happened
- [ ] Any new external claim added to `docs/` was verified against a primary source
