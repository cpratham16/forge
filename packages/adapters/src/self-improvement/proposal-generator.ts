// Proposal Generator — creates bounded harness edit proposals from weakness clusters.
// Based on Self-Harness + HALO: generate concrete diffs with risk assessment.
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { mineWeaknesses, type FailureMechanism } from './weakness-miner.js';
import { getEditableSurface, validateSurfaceChange, type EditableSurface } from './editable-surface.js';

export type { EditableSurface } from './editable-surface.js';

export interface HarnessProposal {
  id: string;
  sourceWeakness: FailureMechanism;
  surface: EditableSurface;
  description: string;
  diff: string;
  regressionRisk: 'low' | 'medium' | 'high';
  estimatedImpact: string;
  createdAt: number;
  status: 'pending' | 'validated' | 'rejected' | 'applied';
}

interface ProposalTemplate {
  surface: EditableSurface;
  weakness: FailureMechanism;
  template: (cluster: { count: number; exampleRuns: string[] }) => string;
}

const PROPOSAL_TEMPLATES: ProposalTemplate[] = [
  {
    surface: 'systemPrompt',
    weakness: 'missing_final_artifact',
    template: (cluster) => `
Add explicit completion criteria to system prompt:

CURRENT:
You are a helpful coding assistant. Be concise.

PROPOSED:
You are a helpful coding assistant. Be concise.
Before declaring a task complete, you MUST:
1. Run all verification commands (build, test, lint)
2. Confirm all verification commands pass
3. Only then declare the task done

Rationale: Cluster "${cluster.count} occurrences of missing_final_artifact" shows agents declare done without verification.
`,
  },
  {
    surface: 'systemPrompt',
    weakness: 'repeated_invalid_command',
    template: (cluster) => `
Add retry guidance to system prompt:

CURRENT:
You are a helpful coding assistant. Be concise.

PROPOSED:
You are a helpful coding assistant. Be concise.
If a tool call fails, you MUST:
1. Analyze the error message
2. Try a different approach or tool
3. Do NOT repeat the same failing command more than twice

Rationale: Cluster "${cluster.count} occurrences of repeated_invalid_command" shows agents repeat failing commands.
`,
  },
  {
    surface: 'systemPrompt',
    weakness: 'no_recovery_after_tool_error',
    template: (cluster) => `
Add recovery guidance to system prompt:

CURRENT:
You are a helpful coding assistant. Be concise.

PROPOSED:
You are a helpful coding assistant. Be concise.
When a tool fails, you MUST:
1. Read the error output carefully
2. Try an alternative tool or approach
3. Do not continue with the same failed approach

Rationale: Cluster "${cluster.count} occurrences of no_recovery_after_tool_error" shows agents don't recover from tool errors.
`,
  },
  {
    surface: 'systemPrompt',
    weakness: 'exploration_without_implementation',
    template: (cluster) => `
Add implementation guidance to system prompt:

CURRENT:
You are a helpful coding assistant. Be concise.

PROPOSED:
You are a helpful coding assistant. Be concise.
Balance exploration with implementation:
- After 3 read/search operations, you MUST perform a write/edit
- Track your read:write ratio; keep it below 5:1
- Do not explore indefinitely without making changes

Rationale: Cluster "${cluster.count} occurrences of exploration_without_implementation" shows agents explore without implementing.
`,
  },
];

function generateProposalId(): string {
  return `prop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function generateProposals(
  traceDir: string = '.forge/traces'
): Promise<HarnessProposal[]> {
  const report = await mineWeaknesses(traceDir);
  const proposals: HarnessProposal[] = [];

  for (const cluster of report.clusters) {
    const templates = PROPOSAL_TEMPLATES.filter((t) => t.weakness === cluster.mechanism);

    for (const template of templates) {
      const surfaceDef = getEditableSurface(template.surface);
      if (!surfaceDef) continue;

      const diff = template.template(cluster);
      validateSurfaceChange(template.surface, diff);

      proposals.push({
        id: generateProposalId(),
        sourceWeakness: cluster.mechanism,
        surface: template.surface,
        description: `Address ${cluster.mechanism.replace(/_/g, ' ')} (${cluster.count} occurrences)`,
        diff: diff.trim(),
        regressionRisk: surfaceDef.regressionRisk,
        estimatedImpact: `Expected to reduce ${cluster.mechanism.replace(/_/g, ' ')} by ${Math.min(50, cluster.count * 10)}%`,
        createdAt: Date.now(),
        status: 'pending',
      });
    }
  }

  return proposals;
}

export async function saveProposals(proposals: HarnessProposal[], outputDir = '.forge/proposals'): Promise<void> {
  await fs.mkdir(outputDir, { recursive: true });
  for (const proposal of proposals) {
    const file = join(outputDir, `${proposal.id}.json`);
    await fs.writeFile(file, JSON.stringify(proposal, null, 2), 'utf8');
  }
}

export async function loadProposals(inputDir = '.forge/proposals'): Promise<HarnessProposal[]> {
  try {
    const files = await fs.readdir(inputDir);
    const proposals: HarnessProposal[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const content = await fs.readFile(join(inputDir, file), 'utf8');
      const proposal = JSON.parse(content) as HarnessProposal;
      proposals.push(proposal);
    }
    return proposals;
  } catch {
    return [];
  }
}

export function formatProposal(proposal: HarnessProposal): string {
  return [
    `Proposal: ${proposal.id}`,
    `Status: ${proposal.status}`,
    `Source: ${proposal.sourceWeakness}`,
    `Surface: ${proposal.surface}`,
    `Risk: ${proposal.regressionRisk}`,
    `Impact: ${proposal.estimatedImpact}`,
    `Created: ${new Date(proposal.createdAt).toISOString()}`,
    '',
    'Description:',
    proposal.description,
    '',
    'Diff:',
    proposal.diff,
  ].join('\n');
}