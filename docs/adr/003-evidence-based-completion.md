# ADR-003: Evidence-based completion

- **Status:** accepted
- **Date:** 2026-09-17
- **Phase:** 0

## Context

LLMs often declare tasks complete prematurely ("self-declared done") without verifying actual functionality, leading to low task resolution quality.

## Decision

Completion is decided strictly by `VerificationPort` evidence (build, test, lint, static analysis) rather than agent self-reports. If verification fails, the task is not complete regardless of LLM status.

## Consequences

- No false completion signals.
- Verification workflows must be explicitly defined and executed.
