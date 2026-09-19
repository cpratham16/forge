import { describe, it, expect } from 'vitest';
import { createSubAgentRouter } from '../src/orchestrator/sub-agent-router.js';
import type { AgentSpec, Task } from '@runforge/contracts';

const agents: AgentSpec[] = [
  { name: 'dev-fast', capabilities: ['coding', 'debugging'], costTier: 'fast', fileOwnership: ['src/**'] },
  { name: 'reviewer-balanced', capabilities: ['review', 'security'], costTier: 'balanced', fileOwnership: ['**'] },
  { name: 'architect-reasoning', capabilities: ['architecture', 'design'], costTier: 'reasoning', fileOwnership: ['docs/**', 'src/**'] },
];

const baseTask: Task = {
  id: 'task-1',
  objective: 'Implement a new feature',
  inputs: { description: 'Add user authentication' },
  successCriteria: [],
  retryPolicy: { maxAttempts: 3, backoffSeconds: 1 },
  modelPolicy: {},
  dependencies: [],
  scope: { in: ['src/auth.ts'], out: [] },
  estimatedComplexity: 'MEDIUM',
  approvalState: 'approved',
  stopConditions: [],
};

describe('HeuristicSubAgentRouter', () => {
  it('returns the only agent when only one is available', async () => {
    const router = createSubAgentRouter();
    const result = await router.route(baseTask, [agents[0]]);
    expect(result.agent).toBe('dev-fast');
    expect(result.confidence).toBe(1.0);
  });

  it('throws when no agents are available', async () => {
    const router = createSubAgentRouter();
    await expect(router.route(baseTask, [])).rejects.toThrow('No agents available');
  });

  it('prefers reasoning agent for HIGH complexity', async () => {
    const router = createSubAgentRouter();
    const highComplexityTask = { ...baseTask, estimatedComplexity: 'HIGH' as const };
    const result = await router.route(highComplexityTask, agents);
    expect(result.agent).toBe('architect-reasoning');
  });

  it('prefers fast agent for LOW complexity', async () => {
    const router = createSubAgentRouter();
    const lowComplexityTask = { ...baseTask, estimatedComplexity: 'LOW' as const };
    const result = await router.route(lowComplexityTask, agents);
    expect(result.agent).toBe('dev-fast');
  });

  it('prefers balanced agent for MEDIUM complexity', async () => {
    const router = createSubAgentRouter();
    const result = await router.route(baseTask, agents);
    expect(result.agent).toBe('reviewer-balanced');
  });

  it('boosts score when agent has relevant capability', async () => {
    const router = createSubAgentRouter();
    const securityTask = { ...baseTask, objective: 'Security audit of authentication', estimatedComplexity: 'MEDIUM' as const };
    const result = await router.route(securityTask, agents);
    expect(result.agent).toBe('reviewer-balanced');
  });

  it('boosts score when agent owns files in scope', async () => {
    const router = createSubAgentRouter();
    const docTask = { ...baseTask, scope: { in: ['docs/architecture.md'], out: [] }, estimatedComplexity: 'HIGH' as const };
    const result = await router.route(docTask, agents);
    expect(result.agent).toBe('architect-reasoning');
  });

  it('provides rationale and confidence', async () => {
    const router = createSubAgentRouter();
    const result = await router.route(baseTask, agents);
    expect(result.rationale).toContain('Heuristic selection');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});