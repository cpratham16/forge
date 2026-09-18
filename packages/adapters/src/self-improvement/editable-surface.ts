// Editable Surface Definition — defines what the self-improvement loop can modify.
// Based on Self-Harness + HALO + ACE: bounded, regression-safe edits only.

export type EditableSurface =
  | 'systemPrompt'
  | 'toolSelectionRules'
  | 'verificationMiddleware'
  | 'recoveryPolicy'
  | 'agentGraph';

export interface EditableSurfaceDef {
  name: EditableSurface;
  description: string;
  filePattern: string;
  regressionRisk: 'low' | 'medium' | 'high';
  validator?: (content: string) => { valid: boolean; error?: string };
}

export const EDITABLE_SURFACES: EditableSurfaceDef[] = [
  {
    name: 'systemPrompt',
    description: 'Main agent system prompt that guides behavior',
    filePattern: 'packages/cli/src/index.ts',
    regressionRisk: 'medium',
    validator: (content: string) => {
      if (!content.includes('You are a helpful coding assistant')) {
        return { valid: false, error: 'System prompt must contain base instruction' };
      }
      return { valid: true };
    },
  },
  {
    name: 'toolSelectionRules',
    description: 'Rules governing which tools are available to agents',
    filePattern: 'packages/cli/src/index.ts',
    regressionRisk: 'high',
    validator: (content: string) => {
      if (!content.includes('ToolRegistry')) {
        return { valid: false, error: 'Must preserve ToolRegistry initialization' };
      }
      return { valid: true };
    },
  },
  {
    name: 'verificationMiddleware',
    description: 'Custom verification logic for the evidence gate',
    filePattern: 'packages/cli/src/index.ts',
    regressionRisk: 'high',
    validator: (content: string) => {
      if (!content.includes('ShellCommandVerifier')) {
        return { valid: false, error: 'Must preserve verifier setup' };
      }
      return { valid: true };
    },
  },
  {
    name: 'recoveryPolicy',
    description: 'Retry/fallback behavior on tool failures',
    filePattern: 'packages/core/src/orchestrator/single-agent-loop.ts',
    regressionRisk: 'medium',
    validator: (content: string) => {
      if (!content.includes('maxTurns')) {
        return { valid: false, error: 'Must preserve maxTurns configuration' };
      }
      return { valid: true };
    },
  },
  {
    name: 'agentGraph',
    description: 'Sub-agent topology and routing (Phase 6+)',
    filePattern: 'packages/core/src/orchestrator/sub-agent-router.ts',
    regressionRisk: 'high',
    validator: (content: string) => {
      if (!content.includes('HeuristicSubAgentRouter')) {
        return { valid: false, error: 'Must preserve router implementation' };
      }
      return { valid: true };
    },
  },
];

export function getEditableSurface(name: EditableSurface): EditableSurfaceDef | undefined {
  return EDITABLE_SURFACES.find((s) => s.name === name);
}

export function listEditableSurfaces(): EditableSurfaceDef[] {
  return [...EDITABLE_SURFACES];
}

export function validateSurfaceChange(surface: EditableSurface, newContent: string): { valid: boolean; error?: string } {
  const def = getEditableSurface(surface);
  if (!def) {
    return { valid: false, error: `Unknown editable surface: ${surface}` };
  }
  if (def.validator) {
    return def.validator(newContent);
  }
  return { valid: true };
}