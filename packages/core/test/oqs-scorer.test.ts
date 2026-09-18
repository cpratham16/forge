import { describe, it, expect } from 'vitest';
import { calculateOQS, projectDriftReport } from '../src/quality/index.js';
import type { Task, TraceEvent, ReviewResult, AgentMessage } from '@forge/contracts';

function createTraceEvent(type: TraceEvent['type'], agent: string, payload: Record<string, unknown> = {}): TraceEvent {
  return {
    id: `evt-${Date.now()}-${Math.random()}`,
    timestamp: Date.now(),
    type,
    agent,
    payload,
  };
}

const baseTask: Task = {
  id: 'task-1',
  objective: 'Implement user authentication',
  inputs: { description: 'Add auth' },
  successCriteria: [
    { description: 'User can log in', verifiable: true },
    { description: 'Passwords are hashed', verifiable: true },
  ],
  retryPolicy: { maxAttempts: 3, backoffSeconds: 1 },
  modelPolicy: {},
  dependencies: [],
  scope: { in: ['src/auth.ts', 'src/auth.test.ts'], out: [] },
  estimatedComplexity: 'MEDIUM',
  approvalState: 'approved',
  stopConditions: [],
};

const baseAgentMessages: AgentMessage[] = [
  { from: 'developer', to: 'reviewer', type: 'task', payload: { description: 'Implement auth' } },
  { from: 'reviewer', to: 'developer', type: 'finding', payload: { severity: 'minor', description: 'Add tests' } },
];

const baseTraceEvents: TraceEvent[] = [
  createTraceEvent('model.request', 'developer'),
  createTraceEvent('model.response', 'developer'),
  createTraceEvent('tool.call', 'developer', { target: 'src/auth.ts' }),
  createTraceEvent('tool.result', 'developer', { target: 'src/auth.ts', output: 'ok' }),
  createTraceEvent('tool.call', 'developer', { target: 'src/auth.test.ts' }),
  createTraceEvent('tool.result', 'developer', { target: 'src/auth.test.ts', output: 'ok' }),
  createTraceEvent('state.transition', 'developer'),
  createTraceEvent('agent.message', 'developer', { type: 'task' }),
  createTraceEvent('agent.message', 'reviewer', { type: 'finding' }),
];

const approvedReview: ReviewResult = {
  reviewer: 'reviewer',
  approved: true,
  blockingFindings: [],
  nonBlockingFindings: [],
  summary: 'Code looks good',
  timestamp: Date.now(),
};

describe('OQS Scorer', () => {
  it('returns scores for all five dimensions', () => {
    const result = calculateOQS({
      task: baseTask,
      traceEvents: baseTraceEvents,
      agentMessages: baseAgentMessages,
      reviewResult: approvedReview,
      developerOutput: 'User can log in. Passwords are hashed.',
    });

    expect(result.planQuality).toBeGreaterThanOrEqual(0);
    expect(result.planQuality).toBeLessThanOrEqual(1);
    expect(result.assignmentQuality).toBeGreaterThanOrEqual(0);
    expect(result.assignmentQuality).toBeLessThanOrEqual(1);
    expect(result.coordination).toBeGreaterThanOrEqual(0);
    expect(result.coordination).toBeLessThanOrEqual(1);
    expect(result.deliverableQuality).toBeGreaterThanOrEqual(0);
    expect(result.deliverableQuality).toBeLessThanOrEqual(1);
    expect(result.efficiency).toBeGreaterThanOrEqual(0);
    expect(result.efficiency).toBeLessThanOrEqual(1);
    expect(result.composite).toBeGreaterThanOrEqual(0);
    expect(result.composite).toBeLessThanOrEqual(1);
  });

  it('produces higher composite for approved review', () => {
    const approved = calculateOQS({
      task: baseTask,
      traceEvents: baseTraceEvents,
      agentMessages: baseAgentMessages,
      reviewResult: approvedReview,
      developerOutput: 'User can log in. Passwords are hashed.',
    });

    const rejectedReview: ReviewResult = {
      ...approvedReview,
      approved: false,
      blockingFindings: [
        { id: 'f1', severity: 'critical', category: 'security', description: 'SQL injection' },
      ],
      nonBlockingFindings: [],
    };

    const rejected = calculateOQS({
      task: baseTask,
      traceEvents: baseTraceEvents,
      agentMessages: baseAgentMessages,
      reviewResult: rejectedReview,
      developerOutput: 'User can log in.',
    });

    expect(approved.composite).toBeGreaterThan(rejected.composite);
  });

  it('reduces score for blocking findings', () => {
    const noFindings = calculateOQS({
      task: baseTask,
      traceEvents: baseTraceEvents,
      agentMessages: baseAgentMessages,
      reviewResult: approvedReview,
    });

    const withBlocking: ReviewResult = {
      ...approvedReview,
      approved: false,
      blockingFindings: [
        { id: 'f1', severity: 'critical', category: 'security', description: 'Issue 1' },
        { id: 'f2', severity: 'major', category: 'logic', description: 'Issue 2' },
      ],
      nonBlockingFindings: [],
    };

    const withFindings = calculateOQS({
      task: baseTask,
      traceEvents: baseTraceEvents,
      agentMessages: baseAgentMessages,
      reviewResult: withBlocking,
    });

    expect(withFindings.deliverableQuality).toBeLessThan(noFindings.deliverableQuality);
  });

  it('non-blocking findings have smaller penalty than blocking', () => {
    const withBlocking: ReviewResult = {
      ...approvedReview,
      approved: false,
      blockingFindings: [
        { id: 'f1', severity: 'critical', category: 'security', description: 'Issue 1' },
        { id: 'f2', severity: 'major', category: 'logic', description: 'Issue 2' },
      ],
      nonBlockingFindings: [],
    };

    const withNonBlocking: ReviewResult = {
      ...approvedReview,
      approved: false,
      blockingFindings: [],
      nonBlockingFindings: [
        { id: 'f1', severity: 'minor', category: 'style', description: 'Style issue' },
      ],
    };

    const blockingResult = calculateOQS({
      task: baseTask,
      traceEvents: baseTraceEvents,
      agentMessages: baseAgentMessages,
      reviewResult: withBlocking,
    });

    const nonBlockingResult = calculateOQS({
      task: baseTask,
      traceEvents: baseTraceEvents,
      agentMessages: baseAgentMessages,
      reviewResult: withNonBlocking,
    });

    expect(blockingResult.deliverableQuality).toBeLessThan(nonBlockingResult.deliverableQuality);
    expect(nonBlockingResult.deliverableQuality - blockingResult.deliverableQuality).toBeGreaterThan(0.1);
  });

  it('uses custom weights when provided', () => {
    const customWeights = {
      planQuality: 0.5,
      assignmentQuality: 0.1,
      coordination: 0.1,
      deliverableQuality: 0.1,
      efficiency: 0.2,
    };

    const result = calculateOQS(
      {
        task: baseTask,
        traceEvents: baseTraceEvents,
        agentMessages: baseAgentMessages,
        reviewResult: approvedReview,
      },
      customWeights,
    );

    expect(result.details.dimensionWeights).toEqual(customWeights);
  });

  it('includes driftReport in details', () => {
    const result = calculateOQS({
      task: baseTask,
      traceEvents: baseTraceEvents,
      agentMessages: baseAgentMessages,
      reviewResult: approvedReview,
    });

    expect(result.details.driftReport).toBeDefined();
    expect(result.details.driftReport.taskId).toBe('task-1');
    expect(result.details.driftReport.driftScore).toBeGreaterThanOrEqual(0);
  });
});

describe('DriftReport projection', () => {
  it('detects unexpected file modifications', () => {
    const traceWithUnexpected = [
      ...baseTraceEvents,
      createTraceEvent('tool.call', 'developer', { target: 'src/unplanned.ts' }),
      createTraceEvent('tool.result', 'developer', { target: 'src/unplanned.ts', output: 'ok' }),
    ];

    const drift = projectDriftReport(baseTask, traceWithUnexpected);

    expect(drift.items.some((i) => i.type === 'unexpected_file_modification')).toBe(true);
    expect(drift.driftScore).toBeGreaterThan(0);
  });

  it('detects omitted planned files', () => {
    const traceNoAuth = baseTraceEvents.filter((e) => !e.payload.target?.toString().includes('auth.ts'));

    const drift = projectDriftReport(baseTask, traceNoAuth);

    expect(drift.items.some((i) => i.type === 'omitted_task')).toBe(true);
  });

  it('detects out-of-sequence agent handoffs', () => {
    const traceWrongOrder: TraceEvent[] = [
      createTraceEvent('agent.message', 'reviewer', { type: 'review' }),
      createTraceEvent('agent.message', 'developer', { type: 'task' }),
    ];

    const drift = projectDriftReport(baseTask, traceWrongOrder);

    expect(drift.items.some((i) => i.type === 'out_of_sequence')).toBe(true);
  });

  it('reports zero drift for clean execution', () => {
    const drift = projectDriftReport(baseTask, baseTraceEvents);

    expect(drift.driftScore).toBe(0);
    expect(drift.items.length).toBe(0);
  });

  it('includes projected event count', () => {
    const drift = projectDriftReport(baseTask, baseTraceEvents);

    expect(drift.projectedFromTraceEvents).toBeGreaterThan(0);
  });
});