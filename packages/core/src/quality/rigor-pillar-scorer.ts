// RigorBench Pillar Scorer — internal 5-pillar projection over trace events
// (PHASED_PLAN Phase 7, PRD §10 "process discipline (RigorBench)").
//
// NOT an adopted external benchmark: it is a pure trace projection in the same
// family as the internal OQS scorer, and carries the same honest caveat
// (docs/RESEARCH_AND_DISCUSSION.md Part 3). A real external RigorBench run
// remains `not_observed` until a genuine RigorBench harness exists; this
// projection exists so the v1.0 process-discipline gate can be measured
// internally on evidence instead of self-declared claims.
//
// Pillars:
//   1. Planning Fidelity  — tool activity stays inside the declared scope.
//   2. Verification Coverage — every success criterion shows a verified result.
//   3. Recovery Efficiency — a failing tool call is followed by a successful one.
//   4. Abstention Quality — "verified" is only claimed alongside evidence; no
//      fabrication of success. Failures/skips count as honest abstention.
//   5. Atomic Transition Integrity — every progress transition is followed by a
//      verification result or a run outcome (no unvalidated jumps).
import type { Task, TraceEvent } from '@forge/contracts';
import { matchResource } from '../policy/util.js';

export interface RigorPillarScore {
  planningFidelity: number;
  verificationCoverage: number;
  recoveryEfficiency: number;
  abstentionQuality: number;
  atomicTransitionIntegrity: number;
  composite: number;
  projectedFromTraceEvents: number;
}

export interface RigorPillarWeights {
  planningFidelity: number;
  verificationCoverage: number;
  recoveryEfficiency: number;
  abstentionQuality: number;
  atomicTransitionIntegrity: number;
}

export const DEFAULT_RIGOR_PILLAR_WEIGHTS: RigorPillarWeights = {
  planningFidelity: 0.2,
  verificationCoverage: 0.2,
  recoveryEfficiency: 0.2,
  abstentionQuality: 0.2,
  atomicTransitionIntegrity: 0.2,
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function scopeIn(task: Task): string[] {
  return task.scope?.in ?? [];
}

function isInScope(target: string, scopeIn: string[]): boolean {
  if (scopeIn.length === 0) return true;
  return scopeIn.some((pattern) => matchResource(pattern, target));
}

function scorePlanningFidelity(traceEvents: TraceEvent[], task: Task): number {
  const toolCalls = traceEvents.filter((e) => e.type === 'tool.call');
  if (toolCalls.length === 0) return 0.5;

  const inScope = toolCalls.filter((e) => {
    const target = String((e.payload as { target?: unknown }).target ?? '');
    return target.length > 0 && isInScope(target, scopeIn(task));
  }).length;

  // A read outside scope is less damaging than a write outside scope, but for
  // the projection any out-of-scope touch is against the plan.
  return clamp01(inScope / toolCalls.length);
}

function scoreVerificationCoverage(traceEvents: TraceEvent[], task: Task): number {
  const criteria = task.successCriteria ?? [];
  const verifications = traceEvents.filter((e) => e.type === 'verification.result');

  if (criteria.length === 0) return verifications.length > 0 ? 1 : 0.5;

  const verified = verifications.filter((e) => (e.payload as { status?: unknown }).status === 'verified');
  const matched = criteria.filter((criterion) =>
    verified.some((e) => {
      const payload = e.payload as { criterion?: unknown; evidence?: Array<{ detail?: unknown; command?: unknown }> };
      const byCriterion = String(payload.criterion ?? '') === criterion.description;
      const byEvidence = (payload.evidence ?? []).some(
        (ev) =>
          String(ev.detail ?? '').includes(criterion.description) ||
          String(ev.command ?? '').includes(criterion.description),
      );
      return byCriterion || byEvidence;
    }),
  ).length;

  return clamp01(matched / criteria.length);
}

function scoreRecoveryEfficiency(traceEvents: TraceEvent[]): number {
  const results = traceEvents.filter((e) => e.type === 'tool.result');
  const errored: Array<{ index: number; target: string }> = [];

  for (let i = 0; i < results.length; i++) {
    const event = results[i]!;
    const hasError = (event.payload as { error?: unknown }).error !== undefined && (event.payload as { error?: unknown }).error !== '';
    if (hasError) {
      errored.push({ index: i, target: String((event.payload as { target?: unknown }).target ?? '') });
    }
  }

  if (errored.length === 0) return 1;

  const recovered = errored.filter(({ index, target }) =>
    results.slice(index + 1).some((e) => {
      const sameTarget = String((e.payload as { target?: unknown }).target ?? '') === target;
      const noError = (e.payload as { error?: unknown }).error === undefined || (e.payload as { error?: unknown }).error === '';
      return sameTarget && noError && e.type === 'tool.result';
    }),
  ).length;

  return clamp01(recovered / errored.length);
}

function scoreAbstentionQuality(traceEvents: TraceEvent[]): number {
  const verifications = traceEvents.filter((e) => e.type === 'verification.result');
  if (verifications.length === 0) return 0.5;

  const honest = verifications.filter((e) => {
    const payload = e.payload as { status?: unknown; evidence?: unknown };
    if (payload.status === 'verified') {
      return Array.isArray(payload.evidence) && payload.evidence.length > 0;
    }
    return payload.status === 'failed' || payload.status === 'skipped' || payload.status === 'not_observed';
  }).length;

  return clamp01(honest / verifications.length);
}

function scoreAtomicTransitionIntegrity(traceEvents: TraceEvent[]): number {
  const transitions = traceEvents.filter((e) => e.type === 'state.transition');
  if (transitions.length === 0) return 0.5;

  const eventIndex = new Map(traceEvents.map((e, i) => [e.id, i]));

  let guarded = 0;
  for (let i = 0; i < transitions.length; i++) {
    const current = transitions[i]!;
    const start = eventIndex.get(current.id) ?? 0;
    const next = transitions[i + 1];
    const end = next !== undefined ? (eventIndex.get(next.id) ?? traceEvents.length - 1) : traceEvents.length;

    const window = traceEvents.slice(start + 1, end);
    const hasVerification = window.some((e) => e.type === 'verification.result');
    const isLast = i === transitions.length - 1;
    const hasRunOutcome = isLast && window.some((e) => e.type === 'run.outcome');

    if (hasVerification || (isLast && hasRunOutcome)) guarded++;
  }

  return clamp01(guarded / transitions.length);
}

export function scoreRigorPillars(
  traceEvents: TraceEvent[],
  task: Task,
  weights: RigorPillarWeights = DEFAULT_RIGOR_PILLAR_WEIGHTS,
): RigorPillarScore {
  const planningFidelity = scorePlanningFidelity(traceEvents, task);
  const verificationCoverage = scoreVerificationCoverage(traceEvents, task);
  const recoveryEfficiency = scoreRecoveryEfficiency(traceEvents);
  const abstentionQuality = scoreAbstentionQuality(traceEvents);
  const atomicTransitionIntegrity = scoreAtomicTransitionIntegrity(traceEvents);

  const composite =
    planningFidelity * weights.planningFidelity +
    verificationCoverage * weights.verificationCoverage +
    recoveryEfficiency * weights.recoveryEfficiency +
    abstentionQuality * weights.abstentionQuality +
    atomicTransitionIntegrity * weights.atomicTransitionIntegrity;

  return {
    planningFidelity,
    verificationCoverage,
    recoveryEfficiency,
    abstentionQuality,
    atomicTransitionIntegrity,
    composite: clamp01(composite),
    projectedFromTraceEvents: traceEvents.length,
  };
}