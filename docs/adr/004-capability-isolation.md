# ADR-004: Capability isolation

- **Status:** accepted
- **Date:** 2026-09-17
- **Phase:** 0

## Context

Agent execution environments need safety controls to prevent unconfined system or network access (preventing control plane hijacking).

## Decision

Separate agent execution environment from harness control plane at both policy and network levels via `PolicyPort` decorators and capability sandboxing.

## Consequences

- Control plane interface is unreachable from agent data plane.
- Runtime action requests undergo policy classification (ALLOW/APPROVE/DENY).
