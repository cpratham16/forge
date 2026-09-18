# @forge/cli — local rules

The first consumer of the runtime, and the thing users actually install.

- This is the **composition root**: the only place adapters get wired into core.
  Concrete adapter choices belong here, not in core.
- May import contracts, core, and adapters.
- CLI surface, `forge.yaml` schema, and expected output format are specified in
  docs/PROJECT_OVERVIEW.md §5 and §6. Match them rather than improvising a
  different UX.
- This package is published to npm as `@forge/cli` at M12. Before that, keep
  `"private": true`. Publishing is a gated, explicit action (`opencode.json`
  prompts on `npm publish`) — never part of an automated merge.
