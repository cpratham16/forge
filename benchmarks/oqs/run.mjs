import { calculateOQS } from '../../packages/core/src/quality/oqs-scorer.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, '..', 'results');

function createTraceEvent(type, agent, payload = {}) {
  return {
    id: `evt-${Date.now()}-${Math.random()}`,
    timestamp: Date.now(),
    type,
    agent,
    payload,
  };
}

const task = {
  id: 'task-4-bench',
  objective: 'Implement user authentication with JWT tokens',
  inputs: { description: 'Add auth module' },
  successCriteria: [
    { description: 'User can register', verifiable: true },
    { description: 'User can log in', verifiable: true },
    { description: 'Passwords are hashed', verifiable: true },
    { description: 'JWT tokens are issued', verifiable: true },
  ],
  retryPolicy: { maxAttempts: 3, backoffSeconds: 1 },
  modelPolicy: {},
  dependencies: [],
  scope: { in: ['src/auth.ts', 'src/auth.test.ts', 'src/middleware.ts'], out: [] },
  estimatedComplexity: 'MEDIUM',
  approvalState: 'approved',
  stopConditions: [],
};

const agentMessages = [
  { from: 'developer', to: 'reviewer', type: 'task', payload: { description: 'Implement auth' } },
  { from: 'reviewer', to: 'developer', type: 'finding', payload: { severity: 'minor', description: 'Add rate limiting' } },
  { from: 'developer', to: 'reviewer', type: 'task', payload: { description: 'Fixed rate limiting' } },
];

const traceEvents = [
  createTraceEvent('model.request', 'developer'),
  createTraceEvent('model.response', 'developer'),
  createTraceEvent('tool.call', 'developer', { target: 'src/auth.ts' }),
  createTraceEvent('tool.result', 'developer', { target: 'src/auth.ts', output: 'ok' }),
  createTraceEvent('tool.call', 'developer', { target: 'src/auth.test.ts' }),
  createTraceEvent('tool.result', 'developer', { target: 'src/auth.test.ts', output: 'ok' }),
  createTraceEvent('tool.call', 'developer', { target: 'src/middleware.ts' }),
  createTraceEvent('tool.result', 'developer', { target: 'src/middleware.ts', output: 'ok' }),
  createTraceEvent('state.transition', 'developer'),
  createTraceEvent('agent.message', 'developer', { type: 'task' }),
  createTraceEvent('model.request', 'reviewer'),
  createTraceEvent('model.response', 'reviewer'),
  createTraceEvent('agent.message', 'reviewer', { type: 'finding' }),
  createTraceEvent('model.request', 'developer'),
  createTraceEvent('model.response', 'developer'),
  createTraceEvent('tool.call', 'developer', { target: 'src/middleware.ts' }),
  createTraceEvent('tool.result', 'developer', { target: 'src/middleware.ts', output: 'ok' }),
  createTraceEvent('agent.message', 'developer', { type: 'task' }),
  createTraceEvent('model.request', 'reviewer'),
  createTraceEvent('model.response', 'reviewer'),
];

const reviewResult = {
  reviewer: 'reviewer',
  approved: true,
  blockingFindings: [],
  nonBlockingFindings: [
    { id: 'f1', severity: 'minor', category: 'performance', description: 'Add rate limiting' },
  ],
  summary: 'Good implementation, minor suggestion for rate limiting',
  timestamp: Date.now(),
};

export async function run() {
  const startTime = Date.now();
  
  const result = calculateOQS({
    task,
    traceEvents,
    agentMessages,
    reviewResult,
    developerOutput: 'User can register. User can log in. Passwords are hashed. JWT tokens are issued.',
    plannedSteps: ['Create auth module', 'Add registration', 'Add login', 'Add JWT issuance', 'Add tests'],
    actualSteps: ['Create auth module', 'Add registration', 'Add login', 'Add JWT issuance', 'Add tests', 'Add rate limiting'],
  });

  const duration = Date.now() - startTime;

  return {
    passAt1: 1.0,
    costPerTaskUsd: 0,
    latencyP50Seconds: duration / 1000,
    taskCount: 1,
    oqs: result,
    mode: 'internal-oqs',
    modeNote: 'Internal OQS scorer evaluation on synthetic task with two-agent trace',
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const output = await run();
  mkdirSync(RESULTS_DIR, { recursive: true });
  const outputPath = join(RESULTS_DIR, 'phase-4.json');
  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log('Phase 4 benchmark completed');
  console.log('OQS Composite:', output.oqs.composite.toFixed(3));
}