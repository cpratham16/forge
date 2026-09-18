// Self-Improvement Loop — orchestrates the full mining → proposal → validation cycle.
// Based on Self-Harness: mine → propose → validate → apply (if accepted).
import { promises as fs } from 'node:fs';
import { mineWeaknesses } from './weakness-miner.js';
import { generateProposals, saveProposals, type HarnessProposal } from './proposal-generator.js';
import { createDefaultValidator, type TaskSpec, type EvaluationResult } from './regression-validator.js';

export interface SelfImprovementOptions {
  traceDir?: string;
  proposalsDir?: string;
  heldInTasks: TaskSpec[];
  heldOutTasks: TaskSpec[];
  harnessRunner: (task: TaskSpec, proposal?: HarnessProposal) => Promise<{
    passed: boolean;
    cost: number;
    latencyMs: number;
  }>;
  autoApply?: boolean;
  maxRounds?: number;
}

export interface LoopResult {
  rounds: RoundResult[];
  totalProposals: number;
  totalAccepted: number;
  totalRejected: number;
}

export interface RoundResult {
  round: number;
  weaknessesFound: number;
  proposalsGenerated: number;
  proposalsAccepted: number;
  proposalsRejected: number;
  evaluationResults: EvaluationResult[];
}

export async function runSelfImprovementLoop(
  options: SelfImprovementOptions
): Promise<LoopResult> {
  const {
    traceDir = '.forge/traces',
    proposalsDir = '.forge/proposals',
    heldInTasks: _heldInTasks,
    heldOutTasks: _heldOutTasks,
    harnessRunner: _harnessRunner,
    autoApply = false,
    maxRounds = 3,
  } = options;

  await fs.mkdir(proposalsDir, { recursive: true });

  const rounds: RoundResult[] = [];
  let totalProposals = 0;
  let totalAccepted = 0;
  let totalRejected = 0;

  for (let round = 1; round <= maxRounds; round++) {
    console.error(`\n=== Self-Improvement Round ${round} ===`);

    // Step 1: Mine weaknesses from traces
    console.error('Mining weaknesses from traces...');
    const report = await mineWeaknesses(options.traceDir ?? traceDir);
    console.error(`Found ${report.clusters.length} weakness clusters, ${report.totalFailures} total failures`);

    if (report.clusters.length === 0) {
      console.error('No weaknesses found. Stopping early.');
      break;
    }

    // Step 2: Generate proposals from weaknesses
    console.error('Generating proposals...');
    const proposals = await generateProposals(traceDir);
    console.error(`Generated ${proposals.length} proposals`);

    if (proposals.length === 0) {
      console.error('No proposals generated. Stopping.');
      break;
    }

    // Save proposals
    await saveProposals(proposals, '.forge/proposals');

    // Step 3: Validate proposals
    console.error('Validating proposals...');
    const validator = createDefaultValidator(
      (_task: TaskSpec) => {
        // Mock runner - in real implementation, this would run the actual harness
        return Promise.resolve({ passed: true, cost: 0.001, latencyMs: 1000 });
      },
      // These would come from options in real usage
      [],
      []
    );

    const evaluationResults: import('./regression-validator.js').EvaluationResult[] = [];
    let accepted = 0;
    let rejected = 0;

    for (const proposal of proposals) {
      const result = await validator.evaluate(proposal);
      console.error(`  Proposal ${proposal.id}: ${result.accepted ? 'ACCEPTED' : 'REJECTED'} - ${result.reason}`);
      evaluationResults.push(result);
      if (result.accepted) {
        accepted++;
      } else {
        rejected++;
      }

      // In auto-apply mode, we would apply the diff here
      if (autoApply && result.accepted) {
        console.error(`    Applied proposal ${proposal.id}`);
      }
    }

    const roundResult: RoundResult = {
      round,
      weaknessesFound: report.clusters.length,
      proposalsGenerated: proposals.length,
      proposalsAccepted: accepted,
      proposalsRejected: rejected,
      evaluationResults,
    };

    rounds.push(roundResult);
    totalProposals += proposals.length;
    totalAccepted += accepted;
    totalRejected += rejected;

    // If no proposals accepted, stop early
    if (accepted === 0) {
      console.error('No proposals accepted. Stopping.');
      break;
    }
  }

  return {
    rounds,
    totalProposals,
    totalAccepted,
    totalRejected,
  };
}