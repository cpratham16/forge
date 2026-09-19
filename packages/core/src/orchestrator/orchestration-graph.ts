import type {
  AgentSpec,
  Task,
  TaskComplexity,
} from '@runforge/contracts';
import { createComplexityClassifier } from './complexity-classifier.js';

export interface OrchestrationGraph {
  nodes: OrchestrationNode[];
  edges: OrchestrationEdge[];
  entryPoint: string;
  metadata: {
    complexity: TaskComplexity;
    estimatedDuration: number;
    agentCount: number;
  };
}

export interface OrchestrationNode {
  id: string;
  agent: string;
  role: 'explorer' | 'planner' | 'developer' | 'tester' | 'reviewer' | 'researcher' | 'architect' | 'security' | 'integration' | 'verification';
  dependencies: string[];
  estimatedDuration: number;
  canParallelize: boolean;
}

export interface OrchestrationEdge {
  from: string;
  to: string;
  type: 'sequential' | 'parallel' | 'conditional';
  condition?: string;
}

export interface OrchestrationGraphGeneratorOptions {
  availableAgents: AgentSpec[];
  defaultAgent?: string;
  enableParallelExecution?: boolean;
  maxParallelBranches?: number;
}

const DEFAULT_AGENTS: AgentSpec[] = [
  { name: 'explorer', capabilities: ['research', 'analysis', 'code-reading'], costTier: 'fast', fileOwnership: ['**'] },
  { name: 'planner', capabilities: ['planning', 'architecture', 'design'], costTier: 'balanced', fileOwnership: ['**'] },
  { name: 'developer', capabilities: ['coding', 'implementation', 'refactoring'], costTier: 'balanced', fileOwnership: ['src/**', 'lib/**'] },
  { name: 'tester', capabilities: ['testing', 'validation', 'qa'], costTier: 'fast', fileOwnership: ['**/*test*', '**/*spec*'] },
  { name: 'reviewer', capabilities: ['review', 'security', 'quality'], costTier: 'balanced', fileOwnership: ['**'] },
  { name: 'researcher', capabilities: ['research', 'analysis', 'documentation'], costTier: 'fast', fileOwnership: ['docs/**', '**/*.md'] },
  { name: 'architect', capabilities: ['architecture', 'system-design', 'scalability'], costTier: 'reasoning', fileOwnership: ['**'] },
  { name: 'security', capabilities: ['security', 'audit', 'compliance', 'penetration-testing'], costTier: 'reasoning', fileOwnership: ['**'] },
  { name: 'integration', capabilities: ['integration', 'deployment', 'devops'], costTier: 'balanced', fileOwnership: ['**/docker*', '**/deploy*', '**/ci/**'] },
  { name: 'verification', capabilities: ['verification', 'validation', 'compliance'], costTier: 'balanced', fileOwnership: ['**'] },
];

/**
 * Predefined orchestration graphs for each complexity level
 */
function getPredefinedGraph(complexity: TaskComplexity, availableAgents: AgentSpec[]): OrchestrationGraph {
  const agentNames = new Set(availableAgents.map(a => a.name));
  const hasAgent = (name: string) => agentNames.has(name);

  const baseNodes: OrchestrationNode[] = [];
  const edges: OrchestrationEdge[] = [];

  if (complexity === 'LOW') {
    // Single agent
    const agentName = hasAgent('developer') ? 'developer' : availableAgents[0]?.name ?? 'developer';
    baseNodes.push({
      id: 'dev-1',
      agent: agentName,
      role: 'developer',
      dependencies: [],
      estimatedDuration: 10,
      canParallelize: false,
    });
    return {
      nodes: baseNodes,
      edges: [],
      entryPoint: 'dev-1',
      metadata: { complexity: 'LOW', estimatedDuration: 10, agentCount: 1 },
    };
  }

  if (complexity === 'MEDIUM') {
    // explorer -> planner -> developer -> tester
    const nodes: OrchestrationNode[] = [];
    let nodeId = 1;

    if (hasAgent('explorer')) {
      nodes.push({ id: `node-${nodeId++}`, agent: 'explorer', role: 'explorer', dependencies: [], estimatedDuration: 5, canParallelize: false });
    }
    if (hasAgent('planner')) {
      nodes.push({ id: `node-${nodeId++}`, agent: 'planner', role: 'planner', dependencies: hasAgent('explorer') ? ['node-1'] : [], estimatedDuration: 10, canParallelize: false });
    }
    if (hasAgent('developer')) {
      const deps = [];
      if (hasAgent('planner')) deps.push(`node-${hasAgent('explorer') ? 2 : 1}`);
      else if (hasAgent('explorer')) deps.push('node-1');
      nodes.push({ id: `node-${nodeId++}`, agent: 'developer', role: 'developer', dependencies: deps, estimatedDuration: 20, canParallelize: false });
    }
    if (hasAgent('tester')) {
      const deps = [`node-${nodeId - 1}`];
      if (hasAgent('planner') && !hasAgent('developer')) deps.push(`node-${hasAgent('explorer') ? 2 : 1}`);
      nodes.push({ id: `node-${nodeId++}`, agent: 'tester', role: 'tester', dependencies: deps, estimatedDuration: 10, canParallelize: false });
    }

    // Add edges
    for (let i = 1; i < nodes.length; i++) {
      const prev = nodes[i - 1];
      const current = nodes[i];
      if (prev && current) {
        edges.push({
          from: prev.id,
          to: current.id,
          type: 'sequential',
        });
      }
    }

    return {
      nodes,
      edges,
      entryPoint: nodes[0]?.id ?? 'node-1',
      metadata: { complexity: 'MEDIUM', estimatedDuration: nodes.reduce((sum, n) => sum + n.estimatedDuration, 0), agentCount: nodes.length },
    };
  }

  // HIGH complexity
  // research -> architecture -> security -> parallel implementation -> integration tests -> adversarial review -> repair -> verification
  const highNodes: OrchestrationNode[] = [];
  let highNodeId = 1;

  const addNode = (agent: string, role: OrchestrationNode['role'], deps: string[] = [], duration: number = 15, parallel: boolean = false) => {
    highNodes.push({ id: `node-${highNodeId++}`, agent, role, dependencies: deps, estimatedDuration: duration, canParallelize: parallel });
  };

  // Phase 1: Research & Analysis (parallel)
  if (hasAgent('researcher')) addNode('researcher', 'researcher', [], 10, false);
  if (hasAgent('architect')) addNode('architect', 'architect', hasAgent('researcher') ? ['node-1'] : [], 15, false);
  if (hasAgent('security')) addNode('security', 'security', hasAgent('architect') ? ['node-2'] : (hasAgent('researcher') ? ['node-1'] : []), 15, false);

  // Phase 2: Parallel Implementation
  const implStart = highNodes.length + 1;
  if (hasAgent('developer')) addNode('developer', 'developer', highNodes.map(n => n.id), 30, true);
  if (hasAgent('integration')) addNode('integration', 'integration', highNodes.map(n => n.id), 20, true);

  // Phase 3: Integration Tests
  const testStart = highNodes.length + 1;
  if (hasAgent('tester')) addNode('tester', 'tester', highNodes.slice(implStart - 1).map(n => n.id), 15, false);

  // Phase 4: Adversarial Review
  const reviewStart = highNodes.length + 1;
  if (hasAgent('reviewer')) addNode('reviewer', 'reviewer', highNodes.slice(testStart - 1).map(n => n.id), 15, false);

  // Phase 5: Repair
  const repairStart = highNodes.length + 1;
  if (hasAgent('developer')) addNode('developer-repair', 'developer', highNodes.slice(reviewStart - 1).map(n => n.id), 20, false);

  // Phase 6: Verification
  if (hasAgent('verification')) addNode('verification', 'verification', highNodes.slice(repairStart - 1).map(n => n.id), 10, false);

  // Add sequential edges within phases, parallel edges between parallelizable nodes
  for (let i = 1; i < highNodes.length; i++) {
    const current = highNodes[i];
    const prev = highNodes[i - 1];
    
    if (current && prev) {
      // If both can parallelize and are in same phase, add parallel edge
      if (current.canParallelize && prev.canParallelize) {
        edges.push({ from: prev.id, to: current.id, type: 'parallel' });
      } else {
        edges.push({ from: prev.id, to: current.id, type: 'sequential' });
      }
    }
  }

  return {
    nodes: highNodes,
    edges,
    entryPoint: highNodes[0]?.id ?? 'node-1',
    metadata: {
      complexity: 'HIGH',
      estimatedDuration: highNodes.reduce((sum, n) => sum + (n.canParallelize ? n.estimatedDuration / 2 : n.estimatedDuration), 0),
      agentCount: new Set(highNodes.map(n => n.agent)).size,
    },
  };
}

/**
 * Generates an adaptive orchestration graph based on task complexity
 */
export class AdaptiveOrchestrationGraphGenerator {
  private readonly options: OrchestrationGraphGeneratorOptions;
  private readonly complexityClassifier;

  constructor(options: OrchestrationGraphGeneratorOptions) {
    this.options = options;
    this.complexityClassifier = createComplexityClassifier();
  }

  async generate(task: Task): Promise<OrchestrationGraph> {
    const classification = this.complexityClassifier.classify(task);
    const availableAgents = this.options.availableAgents.length > 0 
      ? this.options.availableAgents 
      : DEFAULT_AGENTS.filter(_a => this.options.availableAgents.length === 0 || this.options.availableAgents.some(a => a.name === _a.name));
    
    return getPredefinedGraph(classification.complexity, availableAgents);
  }

  getComplexityClassifier() {
    return this.complexityClassifier;
  }
}

export function createOrchestrationGraphGenerator(
  options: OrchestrationGraphGeneratorOptions,
): AdaptiveOrchestrationGraphGenerator {
  return new AdaptiveOrchestrationGraphGenerator(options);
}