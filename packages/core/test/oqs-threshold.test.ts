// OQS v1.0 threshold gate (PHASED_PLAN Phase 7): the internal OQS composite
// must evaluate >= 0.7 for a well-orchestrated known-good run and sit clearly
// below 0.7 for a deliberately poorly-orchestrated known-bad run. The scorer
// is deterministic over its inputs, so the threshold discriminates the same
// way the phase-7 benchmark gate does.
import { describe, it, expect } from 'vitest';
import { calculateOQS } from '../src/quality/oqs-scorer.js';
import type { Task, TraceEvent, AgentMessage, ReviewResult } from '@runforge/contracts';

function ev(type: TraceEvent['type'], agent: string, payload: Record<string, unknown> = {}): TraceEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2)}`,
    timestamp: 1,
    type,
    agent,
    payload,
  };
}

function makeTask(): Task {
  return {
    id: 'task-7-oqs',
    objective: 'Implement payment flow end-to-end with security audit and integration tests',
    inputs: { description: 'Payment system' },
    successCriteria: [
      { description: 'Payment flow works end-to-end', verifiable: true },
      { description: 'Security audit passes', verifiable: true },
      { description: 'Integration tests pass', verifiable: true },
      { description: 'Performance benchmarks met', verifiable: true },
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

interface OqsFixture {
  traceEvents: TraceEvent[];
  agentMessages: AgentMessage[];
  plannedSteps: string[];
  actualSteps: string[];
  reviewResult: ReviewResult;
  developerOutput: string;
}

// A disciplined, in-scope, verified run: every file it touches is in scope,
// all planned files are touched, planning was fully realized, the review
// raised no blockers, criteria were met verbatim, and no step was wasted.
function knownGoodTrace(): OqsFixture {
  const traceEvents: TraceEvent[] = [];
  const agents = ['developer', 'reviewer'];
  const files = ['src/payment.ts', 'src/security.ts', 'src/api.ts', 'src/tests/payment.test.ts'];

  for (let i = 0; i < 6; i++) {
    traceEvents.push(ev('model.request', agents[i % 2]!));
    traceEvents.push(ev('model.response', agents[i % 2]!, { usage: { inputTokens: 100, outputTokens: 50 } }));
  }
  for (let i = 0; i < 8; i++) {
    traceEvents.push(ev('tool.call', 'developer', { target: files[i % files.length]! }));
  }
  for (let i = 0; i < 8; i++) {
    traceEvents.push(ev('tool.result', 'developer', { target: files[i % files.length]!, output: 'ok' }));
  }
  for (let i = 0; i < 6; i++) {
    traceEvents.push(ev('state.transition', 'developer'));
  }
  for (let i = 0; i < 6; i++) {
    traceEvents.push(ev('agent.message', 'developer', { to: 'reviewer' }));
  }

  const agentMessages: AgentMessage[] = [
    { from: 'developer', to: 'tester', type: 'task', payload: 'implement' },
    { from: 'tester', to: 'developer', type: 'review', payload: 'ok' },
    { from: 'developer', to: 'security', type: 'task', payload: 'audit' },
    { from: 'security', to: 'developer', type: 'review', payload: 'ok' },
    { from: 'developer', to: 'reviewer', type: 'task', payload: 'final' },
    { from: 'reviewer', to: 'developer', type: 'review', payload: 'ok' },
    { from: 'developer', to: 'reviewer', type: 'question', payload: 'scope?' },
    { from: 'developer', to: 'reviewer', type: 'question', payload: 'perf?' },
    { from: 'tester', to: 'developer', type: 'finding', payload: 'minor ip' },
    { from: 'security', to: 'developer', type: 'finding', payload: 'rate limit' },
    { from: 'reviewer', to: 'developer', type: 'finding', payload: 'typo' },
    { from: 'reviewer', to: 'developer', type: 'finding', payload: 'comment' },
  ];

  const plannedSteps = [
    'Research payment APIs',
    'Design secure architecture',
    'Implement payment flow',
    'Add security controls',
    'Write integration tests',
    'Run performance benchmark',
  ];
  const actualSteps = [...plannedSteps];

  const reviewResult: ReviewResult = {
    reviewer: 'reviewer',
    approved: true,
    blockingFindings: [],
    nonBlockingFindings: [
      { id: 'f1', severity: 'minor', category: 'docs', description: 'Add connection pooling comment' },
    ],
    summary: 'Approved',
    timestamp: 1,
  };

  const developerOutput =
    'Payment flow works end-to-end. Security audit passes. Integration tests pass. Performance benchmarks met.';

  return { traceEvents, agentMessages, plannedSteps, actualSteps, reviewResult, developerOutput };
}

function knownBadTrace(): OqsFixture {
  const traceEvents: TraceEvent[] = [];
  for (let i = 0; i < 12; i++) {
    traceEvents.push(ev('model.request', 'developer'));
    traceEvents.push(ev('model.response', 'developer', { usage: { inputTokens: 500, outputTokens: 300 } }));
  }
  const outOfScopeTargets = ['config/secret.yaml', 'src/other.ts', 'src/payment.ts', 'src/tests/payment.test.ts'];
  for (let i = 0; i < 4; i++) {
    traceEvents.push(ev('tool.call', 'developer', { target: outOfScopeTargets[i]! }));
  }
  for (let i = 0; i < 4; i++) {
    traceEvents.push(
      ev('tool.result', 'developer', {
        target: outOfScopeTargets[i]!,
        error: i < 2 ? 'command failed' : undefined,
      }),
    );
  }
  traceEvents.push(ev('verification.result', 'developer', { status: 'failed' }));

  const reviewResult: ReviewResult = {
    reviewer: 'reviewer',
    approved: false,
    blockingFindings: [{ id: 'fb1', severity: 'critical', category: 'security', description: 'auth bypass' }],
    nonBlockingFindings: [],
    summary: 'Rejected',
    timestamp: 1,
  };

  return {
    traceEvents,
    agentMessages: [],
    plannedSteps: ['Plan A', 'Plan B', 'Plan C', 'Plan D'],
    actualSteps: [],
    reviewResult,
    developerOutput: '',
  };
}

describe('OQS v1.0 threshold gate', () => {
  it('scores the known-good run at or above the 0.7 v1.0 gate', () => {
    const good = knownGoodTrace();
    const score = calculateOQS({
      task: makeTask(),
      traceEvents: good.traceEvents,
      agentMessages: good.agentMessages,
      reviewResult: good.reviewResult,
      developerOutput: good.developerOutput,
      plannedSteps: good.plannedSteps,
      actualSteps: good.actualSteps,
    });

    expect(score.composite).toBeGreaterThanOrEqual(0.7);
    expect(score.composite).toBeGreaterThan(0.8);
    expect(score.details.driftReport.driftScore).toBe(0);
  });

  it('scores the known-bad run clearly below the 0.7 gate', () => {
    const bad = knownBadTrace();
    const score = calculateOQS({
      task: makeTask(),
      traceEvents: bad.traceEvents,
      agentMessages: bad.agentMessages,
      reviewResult: bad.reviewResult,
      developerOutput: bad.developerOutput,
      plannedSteps: bad.plannedSteps,
      actualSteps: bad.actualSteps,
    });

    expect(score.composite).toBeLessThan(0.7);
    expect(score.details.driftReport.driftScore).toBeGreaterThan(0);
  });

  it('clearly separates good from bad orchestration', () => {
    const good = calculateOQS({ task: makeTask(), ...knownGoodTrace() });
    const bad = calculateOQS({ task: makeTask(), ...knownBadTrace() });
    expect(good.composite - bad.composite).toBeGreaterThan(0.4);
  });
});