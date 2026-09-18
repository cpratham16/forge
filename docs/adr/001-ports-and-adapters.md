# ADR-001: Ports & adapters over a monolithic runtime

- **Status:** accepted
- **Date:** 2026-09-17
- **Phase:** 0

## Context

Every differentiator in docs/PRD.md §8 (adaptive orchestration, trace-first
recording, policy enforcement, evidence-based completion) needs to be added
without rewriting the orchestrator each time. The competing harnesses named in
docs/RESEARCH_AND_DISCUSSION.md Part 2 bury orchestration logic inside the
runtime, which is precisely why their orchestration quality cannot be measured
or replaced from outside.

## Decision

Hexagonal architecture. `packages/contracts` holds pure port interfaces and
domain types with zero dependencies. `packages/core` holds domain logic and
imports only contracts. `packages/adapters` implements ports against the
outside world. Features arrive as adapters or as decorators around existing
ports — never as edits to the orchestrator.

Enforcement is mechanical, not cultural: `.dependency-cruiser.cjs` fails CI on
any violating import. See docs/PROJECT_OVERVIEW.md §4.

## Consequences

Easy: swapping a model vendor, adding tracing or policy without touching
orchestration, testing core with mock adapters, running the same contract test
suite against every adapter.

Hard: more indirection up front; every new capability needs a port designed
before it can be built; core cannot reach for `node:fs` or an HTTP client even
when that would be quicker.

Committed to: the dependency rule is not negotiable per-PR. Weakening a
dependency-cruiser rule to get a build green is a process violation
(AGENTS.md §10), not a shortcut.

## Alternatives considered

A plugin system over a monolithic core — rejected because the orchestrator
itself stays unmeasurable and unreplaceable, which is the exact gap this
project exists to close.
