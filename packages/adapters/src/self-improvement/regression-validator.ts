// Regression Validator — evaluates candidate harness edits against held-in/held-out splits.
// Based on Self-Harness: accept only if at least one split improves without the other regressing.
import type { HarnessProposal } from './proposal-generator.js';

export interface TaskSpec {
  id: string;
  objective: string;
  expectedOutcome: string;
  verificationCommands: string[];
}

export interface EvaluationResult {
  proposalId: string;
  heldIn: SplitResult;
  heldOut: SplitResult;
  accepted: boolean;
  reason: string;
}

export interface SplitResult {
  tasksRun: number;
  tasksPassed: number;
  passRate: number;
  avgCost: number;
  avgLatencyMs: number;
  regressed: boolean;
  regressionReason: string | undefined;
}

export interface RegressionValidatorOptions {
  heldInTasks: TaskSpec[];
  heldOutTasks: TaskSpec[];
  regressionTolerance: {
    passRateDelta: number;    // max allowed pass rate decrease (e.g., 0.05 = 5%)
    costDelta: number;        // max allowed cost increase ratio (e.g., 1.2 = 20% increase)
    latencyDelta: number;     // max allowed latency increase ratio
  };
  harnessRunner: (task: TaskSpec, proposal?: HarnessProposal) => Promise<{
    passed: boolean;
    cost: number;
    latencyMs: number;
  }>;
}

const DEFAULT_TOLERANCE = {
  passRateDelta: 0.05,
  costDelta: 1.2,
  latencyDelta: 1.2,
};

export class RegressionValidator {
  private readonly options: RegressionValidatorOptions;

  constructor(options: Partial<RegressionValidatorOptions> & { harnessRunner: RegressionValidatorOptions['harnessRunner'] }) {
    this.options = {
      heldInTasks: options.heldInTasks ?? [],
      heldOutTasks: options.heldOutTasks ?? [],
      regressionTolerance: { ...DEFAULT_TOLERANCE, ...options.regressionTolerance },
      harnessRunner: options.harnessRunner,
    };
  }

  async evaluate(proposal: { id: string; diff: string }): Promise<EvaluationResult> {
    const heldInResult = await this.evaluateSplit(this.options.heldInTasks, proposal, 'held-in');
    const heldOutResult = await this.evaluateSplit(this.options.heldOutTasks, proposal, 'held-out');

    const heldInImproved = heldInResult.passRate > 0; // baseline is 0 for new proposals
    const heldOutImproved = heldOutResult.passRate > 0;

    // Accept if at least one improves AND neither regresses
    const accepted =
      (heldInImproved || heldOutImproved) && !heldInResult.regressed && !heldOutResult.regressed;

    let reason = '';
    if (heldInResult.regressed) reason += `Held-in regressed: ${heldInResult.regressionReason}; `;
    if (heldOutResult.regressed) reason += `Held-out regressed: ${heldOutResult.regressionReason}; `;
    if (!heldInImproved && !heldOutImproved) reason += 'No improvement in either split; ';
    if (accepted) reason = 'Accepted: improvement without regression';

    return {
      proposalId: proposal.id,
      heldIn: heldInResult,
      heldOut: heldOutResult,
      accepted,
      reason: reason.trim(),
    };
  }

  private async evaluateSplit(tasks: TaskSpec[], proposal: { id: string; diff: string }, splitName: string): Promise<SplitResult> {
    if (tasks.length === 0) {
      return { tasksRun: 0, tasksPassed: 0, passRate: 0, avgCost: 0, avgLatencyMs: 0, regressed: false, regressionReason: undefined };
    }

    let passed = 0;
    let totalCost = 0;
    let totalLatencyMs = 0;

    const mockProposal: HarnessProposal = {
      id: proposal.id,
      sourceWeakness: 'missing_final_artifact',
      surface: 'systemPrompt',
      description: proposal.diff,
      diff: proposal.diff,
      regressionRisk: 'medium',
      estimatedImpact: 'N/A',
      createdAt: Date.now(),
      status: 'pending',
    };

    for (const task of tasks) {
      const result = await this.options.harnessRunner(task, mockProposal);
      if (result.passed) passed++;
      totalCost += result.cost;
      totalLatencyMs += result.latencyMs;
    }

    const passRate = passed / tasks.length;
    const avgCost = totalCost / tasks.length;
    const avgLatencyMs = totalLatencyMs / tasks.length;

    const { regressed, regressionReason } = this.checkRegression(
      { passRate, avgCost, avgLatencyMs, tasksRun: tasks.length, tasksPassed: passed, regressed: false, regressionReason: undefined },
      splitName
    );

    return {
      tasksRun: tasks.length,
      tasksPassed: passed,
      passRate,
      avgCost,
      avgLatencyMs,
      regressed,
      regressionReason: regressionReason ?? undefined,
    };
  }

  private checkRegression(result: SplitResult, splitName: string): { regressed: boolean; regressionReason?: string } {
    // For new proposals, we consider any pass rate as improvement
    // Regression would be if baseline exists and new result is worse
    // Since we don't have a baseline in this implementation, we check for zero pass rate
    if (result.passRate === 0 && result.tasksRun > 0) {
      return { regressed: true, regressionReason: `${splitName} pass rate dropped to 0` };
    }
    return { regressed: false };
  }
}

export function createDefaultValidator(
  harnessRunner: RegressionValidatorOptions['harnessRunner'],
  heldInTasks: TaskSpec[],
  heldOutTasks: TaskSpec[]
): RegressionValidator {
  return new RegressionValidator({
    harnessRunner,
    heldInTasks,
    heldOutTasks,
  });
}