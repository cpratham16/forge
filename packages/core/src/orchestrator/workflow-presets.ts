

export interface WorkflowPreset {
  name: string;
  description: string;
  stages: WorkflowStage[];
  requiredAgents: string[];
}

export interface WorkflowStage {
  name: string;
  agentRole: string;
  description: string;
  dependencies: string[];
  canParallelize: boolean;
  estimatedDuration: number;
  requiredCapabilities: string[];
}

export interface WorkflowPresetsOptions {
  presets: WorkflowPreset[];
  defaultPreset?: string;
}

/**
 * Predefined workflow presets
 */
export const BUILTIN_PRESETS: WorkflowPreset[] = [
  {
    name: 'disciplined-v1',
    description: 'Strict 6-stage pipeline: Investigate → Plan → Work → Review → PR → Release',
    requiredAgents: ['explorer', 'planner', 'developer', 'reviewer', 'tester'],
    stages: [
      {
        name: 'investigate',
        agentRole: 'explorer',
        description: 'Investigate codebase, understand requirements, identify affected areas',
        dependencies: [],
        canParallelize: false,
        estimatedDuration: 10,
        requiredCapabilities: ['research', 'code-reading', 'analysis'],
      },
      {
        name: 'plan',
        agentRole: 'planner',
        description: 'Create detailed implementation plan with task breakdown',
        dependencies: ['investigate'],
        canParallelize: false,
        estimatedDuration: 15,
        requiredCapabilities: ['planning', 'architecture', 'design'],
      },
      {
        name: 'work',
        agentRole: 'developer',
        description: 'Implement the solution according to plan',
        dependencies: ['plan'],
        canParallelize: false,
        estimatedDuration: 30,
        requiredCapabilities: ['coding', 'implementation', 'refactoring'],
      },
      {
        name: 'review',
        agentRole: 'reviewer',
        description: 'Code review and security audit',
        dependencies: ['work'],
        canParallelize: false,
        estimatedDuration: 15,
        requiredCapabilities: ['review', 'security', 'quality'],
      },
      {
        name: 'pr',
        agentRole: 'developer',
        description: 'Create pull request with documentation',
        dependencies: ['review'],
        canParallelize: false,
        estimatedDuration: 5,
        requiredCapabilities: ['documentation', 'communication'],
      },
      {
        name: 'release',
        agentRole: 'integration',
        description: 'Deploy and verify release',
        dependencies: ['pr'],
        canParallelize: false,
        estimatedDuration: 10,
        requiredCapabilities: ['integration', 'deployment', 'devops'],
      },
    ],
  },
  {
    name: 'adaptive',
    description: 'Dynamic orchestration based on task complexity',
    requiredAgents: ['explorer', 'planner', 'developer', 'reviewer', 'tester', 'researcher', 'architect', 'security', 'integration', 'verification'],
    stages: [], // Dynamic
  },
];

export interface WorkflowExecutionContext {
  preset: WorkflowPreset;
  _currentStage: number;
  stageResults: Map<number, unknown>;
  startedAt: number;
  metadata: Record<string, unknown>;
}

export class WorkflowPresetExecutor {
  private readonly options: WorkflowPresetsOptions;
  private currentExecution: WorkflowExecutionContext | null = null;

  constructor(options: WorkflowPresetsOptions) {
    this.options = {
      presets: [...BUILTIN_PRESETS, ...options.presets],
      defaultPreset: options.defaultPreset ?? 'adaptive',
    };
  }

  getPreset(name: string): WorkflowPreset | undefined {
    return this.options.presets.find(p => p.name === name);
  }

  listPresets(): WorkflowPreset[] {
    return this.options.presets;
  }

  getDefaultPreset(): WorkflowPreset {
    const preset = this.getPreset(this.options.defaultPreset ?? 'adaptive');
    if (!preset) throw new Error(`Default preset not found: ${this.options.defaultPreset}`);
    return preset;
  }

  async startExecution(presetName: string, initialContext: Record<string, unknown> = {}): Promise<WorkflowExecutionContext> {
    const preset = this.getPreset(presetName);
    if (!preset) throw new Error(`Preset not found: ${presetName}`);

    this.currentExecution = {
      preset,
      _currentStage: 0,
      stageResults: new Map(),
      startedAt: Date.now(),
      metadata: initialContext,
    };

    return this.currentExecution;
  }

  getCurrentStage(): WorkflowStage | undefined {
    if (!this.currentExecution) return undefined;
    return this.currentExecution.preset.stages[this.currentExecution._currentStage];
  }

  async completeCurrentStage(result: unknown): Promise<WorkflowStage | undefined> {
    if (!this.currentExecution) return undefined;
    
    const _currentStage = this.currentExecution.preset.stages[this.currentExecution._currentStage];
    this.currentExecution.stageResults.set(this.currentExecution._currentStage, result);
    this.currentExecution._currentStage++;

    if (this.currentExecution._currentStage >= this.currentExecution.preset.stages.length) {
      return undefined; // Execution complete
    }

    return this.currentExecution.preset.stages[this.currentExecution._currentStage];
  }

  getExecutionContext(): WorkflowExecutionContext | null {
    return this.currentExecution;
  }

  reset(): void {
    this.currentExecution = null;
  }
}

export interface WorkflowPresetRegistryOptions {
  customPresets?: WorkflowPreset[];
  defaultPreset?: string;
}

/**
 * Registry for managing workflow presets
 */
export class WorkflowPresetRegistry {
  private presets: Map<string, WorkflowPreset> = new Map();
  private defaultPreset: string = 'adaptive';

  constructor(options: WorkflowPresetRegistryOptions = {}) {
    for (const preset of BUILTIN_PRESETS) {
      this.presets.set(preset.name, preset);
    }
    for (const preset of options.customPresets ?? []) {
      this.presets.set(preset.name, preset);
    }
    if (options.defaultPreset) this.defaultPreset = options.defaultPreset;
  }

  register(preset: WorkflowPreset): void {
    this.presets.set(preset.name, preset);
  }

  unregister(name: string): boolean {
    return this.presets.delete(name);
  }

  get(name: string): WorkflowPreset | undefined {
    return this.presets.get(name);
  }

  getDefault(): WorkflowPreset {
    const preset = this.presets.get(this.defaultPreset);
    if (!preset) throw new Error(`Default preset not found: ${this.defaultPreset}`);
    return preset;
  }

  setDefault(name: string): boolean {
    if (!this.presets.has(name)) return false;
    this.defaultPreset = name;
    return true;
  }

  list(): WorkflowPreset[] {
    return Array.from(this.presets.values());
  }

  getNames(): string[] {
    return Array.from(this.presets.keys());
  }
}

export function createWorkflowPresetRegistry(options: WorkflowPresetRegistryOptions = {}): WorkflowPresetRegistry {
  return new WorkflowPresetRegistry(options);
}

export function createWorkflowPresetExecutor(options: WorkflowPresetsOptions = { presets: [] }): WorkflowPresetExecutor {
  return new WorkflowPresetExecutor(options);
}