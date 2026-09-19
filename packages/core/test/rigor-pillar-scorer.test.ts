// RigorBench pillar projection tests (PHASED_PLAN Phase 7): the five-pillar
// trace proxy for process discipline. A rigorously-executed run scores high on
// all pillars; a sloppy one scores low. This is an internal projection with
// the same honest caveats as the internal OQS scorer — not an adopted external
// benchmark.
import { describe, it, expect } from 'vitest';
import { scoreRigorPillars } from '../src/quality/rigor-pillar-scorer.js';
import type { Task, TraceEvent } from '@runforge/contracts';

function ev(type: TraceEvent['type'], agent: string, payload: Record<string, unknown> = {}): TraceEvent {
  return { id: `evt-${Math.random().toString(36).slice(2)}`, timestamp: 1, type, agent, payload };
}

function makeTask(): Task {
  return {
    id: 'task-7-rigor',
    objective: 'Implement payment flow with verified completion',
    inputs: { description: 'Payment system' },
    successCriteria: [
      { description: 'Payment flow works', verifiable: true },
      { description: 'Security audit passes', verifiable: true },
      { description: 'Integration tests pass', verifiable: true },
    ],
    retryPolicy: { maxAttempts: 3, backoffSeconds: 1 },
    modelPolicy: {},
    dependencies: [],
    scope: { in: ['src/payment.ts', 'src/security.ts', 'src/api.ts', 'src/tests/payment.test.ts'], out: [] },
    estimatedComplexity: 'HIGH',
    approvalState: 'approved',
    stopConditions: [],
  };
}

function rigorousTrace(): TraceEvent[] {
  const trace: TraceEvent[] = [];
  for (const file of ['src/payment.ts', 'src/security.ts', 'src/api.ts', 'src/tests/payment.test.ts', 'src/payment.ts']) {
    trace.push(ev('tool.call', 'developer', { target: file }));
    trace.push(ev('tool.result', 'developer', { target: file, output: 'ok' }));
  }
  trace.push(ev('state.transition', 'developer', { from: 'build', to: 'verify' }));
  trace.push(ev('verification.result', 'developer', { status: 'verified', criterion: 'Payment flow works', evidence: [{ detail: 'tests passed' }] }));
  trace.push(ev('state.transition', 'developer', { from: 'verify', to: 'release' }));
  trace.push(ev('verification.result', 'developer', { status: 'verified', criterion: 'Security audit passes', evidence: [{ detail: 'audit clean' }] }));
  trace.push(ev('verification.result', 'developer', { status: 'verified', criterion: 'Integration tests pass', evidence: [{ detail: '26/26 passed' }] }));
  trace.push(ev('run.outcome', 'developer', { status: 'completed' }));
  return trace;
}

function sloppyTrace(): TraceEvent[] {
  const trace: TraceEvent[] = [];
  // Out-of-scope churn with repeated unrecovered failures.
  for (const file of ['config/secret.yaml', 'src/other.ts', 'src/other.ts']) {
    trace.push(ev('tool.call', 'developer', { target: file }));
    trace.push(ev('tool.result', 'developer', { target: file, output: 'ok' }));
  }
  trace.push(ev('tool.call', 'developer', { target: 'src/other.ts' }));
  trace.push(ev('tool.result', 'developer', { target: 'src/other.ts', error: 'command failed' }));
  trace.push(ev('tool.call', 'developer', { target: 'src/other.ts' }));
  trace.push(ev('tool.result', 'developer', { target: 'src/other.ts', error: 'command failed' }));
  // Claimed verified with no evidence and no matching criterion (dishonest).
  trace.push(ev('verification.result', 'developer', { status: 'verified', criterion: 'unrelated', evidence: [] }));
  // Unvalidated transitions: nothing between them, nothing after the last.
  trace.push(ev('state.transition', 'developer', { from: 'build', to: 'verify' }));
  trace.push(ev('state.transition', 'developer', { from: 'verify', to: 'release' }));
  return trace;
}

describe('scoreRigorPillars', () => {
  it('scores a rigorously-executed trace at full marks on every pillar', () => {
    const score = scoreRigorPillars(rigorousTrace(), makeTask());

    expect(score.planningFidelity).toBe(1);
    expect(score.verificationCoverage).toBe(1);
    expect(score.recoveryEfficiency).toBe(1);
    expect(score.abstentionQuality).toBe(1);
    expect(score.atomicTransitionIntegrity).toBe(1);
    expect(score.composite).toBe(1);
  });

  it('scores a sloppy trace low on every pillar', () => {
    const score = scoreRigorPillars(sloppyTrace(), makeTask());

    expect(score.planningFidelity).toBe(0);
    expect(score.verificationCoverage).toBe(0);
    expect(score.recoveryEfficiency).toBe(0);
    expect(score.abstentionQuality).toBe(0);
    expect(score.atomicTransitionIntegrity).toBe(0);
    expect(score.composite).toBe(0);
  });

  it('separates rigorous from sloppy execution', () => {
    const rigorous = scoreRigorPillars(rigorousTrace(), makeTask());
    const sloppy = scoreRigorPillars(sloppyTrace(), makeTask());
    expect(rigorous.composite - sloppy.composite).toBeGreaterThan(0.7);
  });
});