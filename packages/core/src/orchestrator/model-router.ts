import type {
  Task,
  TaskComplexity,
  ModelCapability,
} from '@runforge/contracts';

export interface ModelRoutingOptions {
  /** Cost budget per task (USD) */
  maxCostPerTask?: number;
  /** Latency budget per request (ms) */
  maxLatencyMs?: number;
  /** Prefer local models when available */
  preferLocal?: boolean;
  /** Enable cost optimization */
  optimizeCost?: boolean;
}

export interface RoutingDecision {
  selectedModel: ModelCapability;
  fallbackModels: ModelCapability[];
  rationale: string;
  estimatedCost: number;
  estimatedLatencyMs: number;
}

/**
 * Task requirements for model selection
 */
export interface TaskRequirements {
  complexity: TaskComplexity;
  requiredCapabilities: string[];
  estimatedTokens: number;
  requiresReasoning: boolean;
  requiresLongContext: boolean;
  budgetUSD: number | undefined;
  maxLatencyMs: number | undefined;
}

/**
 * Extracts task requirements from a task
 */
export function extractTaskRequirements(task: Task): TaskRequirements {
  const objectiveLower = task.objective.toLowerCase();
  
  const requiredCapabilities = new Set<string>();
  
  if (/cod|implement|develop|refactor|debug|fix/.test(objectiveLower)) {
    requiredCapabilities.add('coding');
  }
  if (/reason|analyz|architect|design|plan/.test(objectiveLower)) {
    requiredCapabilities.add('reasoning');
  }
  if (/secur|audit|compliance|vulnerab/.test(objectiveLower)) {
    requiredCapabilities.add('security');
  }
  if (/test|qa|validat/.test(objectiveLower)) {
    requiredCapabilities.add('testing');
  }
  if (/document|doc/.test(objectiveLower)) {
    requiredCapabilities.add('documentation');
  }
  if (/research|explor|investigat/.test(objectiveLower)) {
    requiredCapabilities.add('research');
  }
  
  // Estimate tokens from scope
  const estimatedTokens = (task.scope?.in?.length ?? 0) * 500 + 1000;
  
  const requiresReasoning = task.estimatedComplexity === 'HIGH' || requiredCapabilities.has('reasoning') || requiredCapabilities.has('security');
  const requiresLongContext = (task.scope?.in?.length ?? 0) > 5 || requiredCapabilities.has('research');
  
  return {
    complexity: task.estimatedComplexity,
    requiredCapabilities: Array.from(requiredCapabilities),
    estimatedTokens,
    requiresReasoning,
    requiresLongContext,
    budgetUSD: task.modelPolicy?.maxCostUsd ?? undefined,
    maxLatencyMs: task.modelPolicy?.maxCostUsd ? undefined : 30000,
  };
}

/**
 * Filters models by requirements
 */
export function filterModelsByRequirements(
  models: ModelCapability[],
  requirements: TaskRequirements,
  options: ModelRoutingOptions = {}
): ModelCapability[] {
  return models.filter(model => {
    // Check capabilities
    const hasCapabilities = requirements.requiredCapabilities.every(
      cap => model.strengths.some(s => s.toLowerCase().includes(cap.toLowerCase()))
    );
    if (!hasCapabilities && requirements.requiredCapabilities.length > 0) return false;
    
    // Check context window
    if (requirements.requiresLongContext && model.contextWindow < 32768) return false;
    
    // Check reasoning capability
    if (requirements.requiresReasoning && !model.strengths.includes('reasoning')) return false;
    
    // Check cost budget
    if (requirements.budgetUSD && options.maxCostPerTask) {
      const modelCost = getModelCostPerTask(model);
      if (modelCost > options.maxCostPerTask) return false;
    }
    
    // Check latency budget
    if (requirements.maxLatencyMs && options.maxLatencyMs) {
      if (model.latencyMs > options.maxLatencyMs) return false;
    }
    
    return true;
  });
}

/**
 * Estimates cost per task for a model (USD)
 */
function getModelCostPerTask(model: ModelCapability): number {
  const costPer1kTokens: Record<string, number> = {
    'free': 0,
    'low': 0.00015,
    'medium': 0.001,
    'high': 0.01,
    'premium': 0.03,
  };
  return (costPer1kTokens[model.costTier] ?? 0) * 10; // Estimate 10k tokens per task
}

/**
 * Scores a model for a given task
 */
export function scoreModelForTask(
  model: ModelCapability,
  requirements: TaskRequirements,
  options: ModelRoutingOptions = {}
): number {
  let score = 0;
  
  // Capability match
  const capMatch = requirements.requiredCapabilities.filter(
    cap => model.strengths.some(s => s.toLowerCase().includes(cap.toLowerCase()))
  ).length / Math.max(requirements.requiredCapabilities.length, 1);
  score += capMatch * 40;
  
  // Complexity match
  if (requirements.complexity === 'HIGH' && model.strengths.includes('reasoning')) score += 20;
  if (requirements.complexity === 'LOW' && model.costTier === 'free') score += 15;
  
  // Context window
  if (requirements.requiresLongContext && model.contextWindow >= 100000) score += 15;
  else if (requirements.requiresLongContext && model.contextWindow >= 32768) score += 10;
  
  // Reasoning
  if (requirements.requiresReasoning && model.strengths.includes('reasoning')) score += 15;
  
  // Cost optimization
  if (options.optimizeCost) {
    const cost = getModelCostPerTask(model);
    if (cost === 0) score += 20;
    else if (cost < 0.001) score += 10;
    else if (cost < 0.01) score += 5;
  }
  
  // Latency
  if (options.maxLatencyMs && model.latencyMs <= options.maxLatencyMs) score += 10;
  else if (!options.maxLatencyMs && model.latencyMs < 1000) score += 5;
  
  // Local preference
  if (options.preferLocal && model.provider === 'ollama') score += 10;
  
  return score;
}

/**
 * Selects the best model for a task
 */
export function selectBestModel(
  requirements: TaskRequirements,
  availableModels: ModelCapability[],
  options: ModelRoutingOptions = {}
): RoutingDecision {
  if (availableModels.length === 0) {
    throw new Error('No models available for routing');
  }
  
  const filtered = filterModelsByRequirements(availableModels, requirements, options);
  
  // Get fallback model (first available) - guaranteed to exist due to length check above
  const fallbackModel = availableModels[0]!;
  
  if (filtered.length === 0) {
    return {
      selectedModel: fallbackModel,
      fallbackModels: [],
      rationale: 'No models matched requirements, using first available',
      estimatedCost: getModelCostPerTask(fallbackModel),
      estimatedLatencyMs: fallbackModel.latencyMs,
    };
  }
  
  // Score and sort
  const scored = filtered.map(model => ({
    model,
    score: scoreModelForTask(model, requirements, options),
  }));
  
  scored.sort((a, b) => b.score - a.score);
  
  const best = scored[0];
  if (!best) {
    return {
      selectedModel: fallbackModel,
      fallbackModels: [],
      rationale: 'No models matched requirements, using default',
      estimatedCost: getModelCostPerTask(fallbackModel),
      estimatedLatencyMs: fallbackModel.latencyMs,
    };
  }
  
  const fallbacks = scored.slice(1, 3).map(s => s.model);
  
  return {
    selectedModel: best.model,
    fallbackModels: fallbacks,
    rationale: `Selected ${best.model.name} (score: ${best.score.toFixed(1)}) for ${requirements.complexity} complexity task requiring ${Array.from(requirements.requiredCapabilities).join(', ') || 'general capabilities'}`,
    estimatedCost: getModelCostPerTask(best.model),
    estimatedLatencyMs: best.model.latencyMs,
  };
}

export interface ModelRouter {
  route(task: Task, availableModels: ModelCapability[]): Promise<RoutingDecision>;
}

export class HeuristicModelRouter implements ModelRouter {
  constructor(private readonly options: ModelRoutingOptions = {}) {}

  async route(task: Task, availableModels: ModelCapability[]): Promise<RoutingDecision> {
    const requirements = extractTaskRequirements(task);
    return selectBestModel(requirements, availableModels, this.options);
  }
}

export function createModelRouter(options?: ModelRoutingOptions): ModelRouter {
  return new HeuristicModelRouter(options);
}