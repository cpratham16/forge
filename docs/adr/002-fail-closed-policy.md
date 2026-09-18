# ADR-002: Fail-Closed Policy Enforcement

- **Status:** accepted
- **Date:** 2026-09-18
- **Phase:** 3

## Context

In agent runtimes, policy evaluation failures (exceptions thrown by rule engines, timeouts, malformed decision objects, or unreachable policy processes) can inadvertently result in fail-open behavior where prohibited actions are permitted. A security control that fails open creates false confidence and exposes host systems to unreviewed destructive actions or prompt-injection attacks.

## Decision

All `PolicyPort` evaluations must fail closed. Any exception, timeout, malformed `PolicyDecision`, or unreachable policy evaluator MUST resolve to an explicit `deny` outcome. Furthermore, core enforces a compiled-in, non-overridable `RUNTIME_FLOOR` deny list that is evaluated prior to any configurable project/user policy engine and cannot be overridden by `forge.yaml`.

## Consequences

- Tool execution is guaranteed to be blocked whenever policy evaluation fails or encounters an anomaly.
- Non-negotiable security boundaries (such as verification bypass via `git commit --no-verify`, force pushes, or secret leaks) are structurally impossible to disable via configuration.
- Policy decorators and handlers must implement strict timeout and error catching to return `deny` decisions gracefully.

## Alternatives Considered

- **Fail-open with warning:** Rejected because security controls that degrade to warnings produce false security confidence.
- **Configurable failure behavior:** Rejected because allowing users or agents to configure `fail-open` in `forge.yaml` creates a critical vulnerability vector when operating on untrusted repositories.
