# @runforge/core — local rules

Domain logic. The part that must stay measurable and replaceable.

- **Imports `@runforge/contracts` and nothing else.** No adapters, no vendor SDKs,
  no `node:fs` / `node:http` / `node:child_process`. All four are blocked in CI.
- Everything external arrives by **injection** through a port. If a function
  needs to read a file, it takes a `ToolPort`; it does not import `fs`.
- **New capabilities are decorators, not orchestrator edits.** Tracing wraps
  `ModelProvider`. Policy wraps `ToolPort`. If you find yourself adding an
  `if (tracingEnabled)` branch inside the orchestrator loop, stop — that is the
  design mistake this package's structure exists to prevent (PRD §5,
  PHASED_PLAN Phase 3).
- **No self-declared done.** Completion is decided by `verification/`, from
  evidence. Never have an agent's own claim of success short-circuit a gate.
- Layout and intent per directory are in docs/PROJECT_OVERVIEW.md §1. Note
  `quality/oqs-scorer.ts` is Forge's **internal** five-dimension scorer — it is
  not an adopted external benchmark (see the EPOB caveat in
  docs/RESEARCH_AND_DISCUSSION.md Part 3). Do not cite it externally as one.
- Core is where unit tests are cheapest and most valuable: it has no I/O, so
  test it directly against mock adapters.
