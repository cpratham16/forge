import type {
  AgentSpec,
  AgentSelection,
  SubAgentRouter,
  Task,
} from '@forge/contracts';

export interface HeuristicRouterOptions {
  preferReasoningForComplex?: boolean;
  defaultCostTier?: 'fast' | 'balanced' | 'reasoning';
}

function scoreAgentForTask(agent: AgentSpec, task: Task, options: HeuristicRouterOptions): number {
  let score = 0;
  const complexity = task.estimatedComplexity ?? 'MEDIUM';

  if (complexity === 'HIGH' && (agent.capabilities.includes('reasoning') || agent.costTier === 'reasoning')) {
    score += 10;
  }
  if (complexity === 'LOW' && agent.costTier === 'fast') {
    score += 8;
  }
  if (complexity === 'MEDIUM' && agent.costTier === 'balanced') {
    score += 8;
  }

  const hasRelevantCapability = agent.capabilities.some((cap) =>
    task.objective.toLowerCase().includes(cap.toLowerCase()),
  );
  if (hasRelevantCapability) {
    score += 5;
  }

  if (task.scope?.in) {
    for (const file of task.scope.in) {
      for (const pattern of agent.fileOwnership) {
        if (matchesOwnershipPattern(file, pattern)) {
          score += 5;
          break;
        }
      }
    }
  }

  if (agent.costTier === (options.defaultCostTier ?? 'balanced')) {
    score += 2;
  }

  return score;
}

function matchesOwnershipPattern(path: string, pattern: string): boolean {
  if (pattern === '**') return true;
  if (pattern.endsWith('**')) {
    const prefix = pattern.slice(0, -2);
    return path === prefix || path.startsWith(prefix);
  }
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return path.startsWith(prefix);
  }
  if (pattern.includes('*')) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(path);
  }
  return path === pattern || path.startsWith(pattern + '/');
}

export class HeuristicSubAgentRouter implements SubAgentRouter {
  constructor(private readonly options: HeuristicRouterOptions = {}) {}

  async route(task: unknown, agents: AgentSpec[]): Promise<AgentSelection> {
    const typedTask = task as Task;
    if (agents.length === 0) {
      throw new Error('No agents available for routing');
    }
    const firstAgent = agents[0];
    if (!firstAgent) {
      throw new Error('First agent is undefined');
    }
    if (agents.length === 1) {
      return {
        agent: firstAgent.name,
        rationale: 'Only one agent available',
        confidence: 1.0,
      };
    }

    const scored = agents.map((agent) => ({
      agent,
      score: scoreAgentForTask(agent, typedTask, this.options),
    }));

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    const secondBest = scored[1];

    if (!best) {
      throw new Error('No best agent found after scoring');
    }

    const confidence = secondBest
      ? Math.min(1, (best.score - secondBest.score) / (best.score + 1))
      : 1;

    return {
      agent: best.agent.name,
      rationale: `Heuristic selection: scored ${best.score} (complexity: ${typedTask.estimatedComplexity}, capabilities: ${best.agent.capabilities.join(', ')})`,
      confidence,
    };
  }
}

export function createSubAgentRouter(
  options?: HeuristicRouterOptions,
): SubAgentRouter {
  return new HeuristicSubAgentRouter(options);
}