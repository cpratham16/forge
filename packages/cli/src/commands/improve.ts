// `forge improve` — run the self-improvement loop.
import type { SelfImprovementOptions } from '@runforge/adapters';
import type { TaskSpec } from '@runforge/adapters';

export async function improveCommand(args: string[]): Promise<string> {
  const traceDirIdx = args.indexOf('--dir');
  const traceDir = traceDirIdx !== -1 ? args[traceDirIdx + 1] : '.forge/traces';

  const roundsIdx = args.indexOf('--rounds');
  const maxRounds = roundsIdx !== -1 ? parseInt(args[roundsIdx + 1] ?? '3', 10) : 3;

  const autoApply = args.includes('--auto-apply');

  const asJson = args.includes('--json');

  // Mock task specs for demonstration
  const heldInTasks: TaskSpec[] = [
    { id: 'task-1', objective: 'Implement login', expectedOutcome: 'Login works', verificationCommands: ['npm test'] },
    { id: 'task-2', objective: 'Add logout', expectedOutcome: 'Logout works', verificationCommands: ['npm test'] },
  ];

  const heldOutTasks: TaskSpec[] = [
    { id: 'task-3', objective: 'Add password reset', expectedOutcome: 'Reset works', verificationCommands: ['npm test'] },
  ];

  // Mock harness runner
  const harnessRunner = async (_task: TaskSpec): Promise<{ passed: boolean; cost: number; latencyMs: number }> => {
    return { passed: true, cost: 0.001, latencyMs: 1000 };
  };

  const { runSelfImprovementLoop } = await import('@runforge/adapters');

  const options: SelfImprovementOptions = {
    ...(traceDir !== undefined ? { traceDir } : {}),
    heldInTasks,
    heldOutTasks,
    harnessRunner,
    autoApply,
    maxRounds,
  };

  const result = await runSelfImprovementLoop(options);

  if (asJson) {
    return JSON.stringify(result, null, 2);
  }

  const lines = [
    `Self-Improvement Loop Complete`,
    `==============================`,
    `Rounds: ${result.rounds.length}`,
    `Total Proposals: ${result.totalProposals}`,
    `Accepted: ${result.totalAccepted}`,
    `Rejected: ${result.totalRejected}`,
    '',
  ];

  for (const round of result.rounds) {
    lines.push(`Round ${round.round}:`);
    lines.push(`  Weaknesses: ${round.weaknessesFound}`);
    lines.push(`  Proposals: ${round.proposalsGenerated}`);
    lines.push(`  Accepted: ${round.proposalsAccepted}`);
    lines.push(`  Rejected: ${round.proposalsRejected}`);
    lines.push('');
  }

  return lines.join('\n');
}