# Forge

A model-agnostic agent orchestration runtime for software development. Compose
specialized agents, tools, policies, and verification workflows from a CLI or
TypeScript SDK.

**Core thesis:** orchestration quality as a measured, optimizable quantity — not
"more agents." Full rationale in [`docs/PRD.md`](docs/PRD.md).

> Status: pre-v0.1, Phase 0. See [`.opencode/STATE.md`](.opencode/STATE.md) for
> exactly where the build is right now.

## The dependency rule

This is the one thing to understand before contributing:

```
contracts  ->  (nothing)
core       ->  contracts
adapters   ->  contracts, core
cli        ->  core, adapters, contracts
```

`core` never imports an adapter, a vendor SDK, or a node builtin. Enforced
mechanically by `.dependency-cruiser.cjs` in CI, not by convention. New
capabilities are added as adapters or as decorators around existing ports —
never by editing the orchestrator. See [ADR-001](docs/adr/001-ports-and-adapters.md).

## Layout

```
docs/            PRD, phased plan, research, architecture reference, ADRs
packages/
  contracts/     pure ports + domain types, zero deps
  core/          domain logic, no external imports
  adapters/      concrete implementations of ports
  cli/           composition root, published as @forge/cli
benchmarks/      per-phase runners + committed baselines
scripts/         bootstrap, branch protection, benchmark gate
.opencode/       agent commands, subagents, and live build state
AGENTS.md        standing orders for agent sessions
```

## Getting started

```bash
corepack enable && corepack prepare pnpm@9 --activate
pnpm install
pnpm lint && pnpm dep-check && pnpm typecheck && pnpm test
```

First-time repo setup:

```bash
./scripts/bootstrap.sh <owner>/<repo>
```

## How work happens here

Development is driven through [OpenCode](https://opencode.ai) sessions governed
by [`AGENTS.md`](AGENTS.md). One branch per phase, off `develop`:

```
/phase-start 0    branch the phase, load its plan, update state
   ...work...
/phase-verify     independent read-only gate check
/phase-pr         push + open PR into develop
/phase-merge      merge, but only if required CI checks are green
/release          develop -> main, always with human confirmation
```

Nothing reaches `develop` without lint, dependency-cruiser, typecheck, tests,
and (Phases 2–6) a non-regressing benchmark. Nothing reaches `main` without a
human explicitly saying so.

## Docs

| File | What it's for |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | Identity, principles, ports, non-goals, milestones |
| [`docs/PHASED_PLAN.md`](docs/PHASED_PLAN.md) | Per-phase deliverables, tests, benchmarks |
| [`docs/RESEARCH_AND_DISCUSSION.md`](docs/RESEARCH_AND_DISCUSSION.md) | Evidence base, and caveats on claims that didn't survive checking |
| [`docs/PROJECT_OVERVIEW.md`](docs/PROJECT_OVERVIEW.md) | Repo layout, port contracts, domain types, config |

## License

Apache 2.0.
