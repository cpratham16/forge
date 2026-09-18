# ADR-002: Trace-first architecture

- **Status:** accepted
- **Date:** 2026-09-17
- **Phase:** 0

## Context

Orchestration quality and self-improvement require fine-grained observability of agent actions, decisions, model responses, and verification outcomes.

## Decision

Record execution traces from day one via standard OpenTelemetry-compatible `TracePort`. Wrap existing ports as decorators (e.g. `TracePort` decorator around `ModelProvider`) without modifying core orchestrator logic.

## Consequences

- All executions produce structured trace events.
- Trajectory mining can run offline without altering runtime logic.
- Zero touch to orchestrator loop when adding tracing sinks.
