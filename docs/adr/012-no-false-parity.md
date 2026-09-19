# ADR-012: No False Parity in Adapter Conformance

- **Status:** accepted
- **Date:** 2026-09-18
- **Phase:** 2, 5

## Context

Forge is model-agnostic and features replaceable adapters across all ports (`ModelProvider`, `ToolPort`, `VerificationPort`, etc.). However, different host environments and adapter implementations provide materially different levels of isolation, containment, and capability enforcement. Presenting two adapters under a single port label (e.g., claiming both a sandboxed local container shell adapter and an uncontained host shell adapter simply "implement `ToolPort`") creates false equivalence and misleads users regarding runtime safety guarantees.

## Decision

Adapters must explicitly declare their conformance profile via `AdapterConformance` metadata, stating the exact guarantees they enforce, guarantees they do NOT enforce, and known limitations. The runtime and CLI must surface these explicit conformance declarations to the user rather than presenting unequal implementations as equivalent. False parity is forbidden.

## Consequences

- Users and orchestrators can inspect precise adapter guarantees at runtime.
- Adapters cannot claim full compliance with a capability tier unless every underlying guarantee is verified.
- CLI commands can warn users when an active adapter lacks critical safety or containment guarantees.

## Alternatives Considered

- **Single binary tier labels (e.g., Tier 1 vs Tier 2):** Rejected because coarse tiers mask specific missing enforcement mechanisms (e.g., path jailing vs command filtering).
- **Silent runtime fallback:** Rejected because falling back to weaker adapters without explicit declaration creates silent security regressions.
