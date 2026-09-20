// `forge validate` — run regression validation on a proposal.
import type { TaskSpec } from '@runforge/adapters';

export async function validateCommand(args: string[]): Promise<string> {
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

  const { RegressionValidator } = await import('@runforge/adapters');
  const validator = new RegressionValidator({
    harnessRunner,
    heldInTasks,
    heldOutTasks,
  });

  const result = await validator.evaluate({ id: 'prop-mock', diff: '+ Add verification reminder' });

  if (asJson) {
    return JSON.stringify(result, null, 2);
  }

  const lines = [
    `Validation Result for ${result.proposalId}`,
    `Accepted: ${result.accepted ? 'YES' : 'NO'}`,
    `Reason: ${result.reason}`,
    '',
    'Held-in Split:',
    `  Tasks: ${result.heldIn.tasksRun}, Passed: ${result.heldIn.tasksPassed}, Pass Rate: ${(result.heldIn.passRate * 100).toFixed(1)}%`,
    `  Avg Cost: $${result.heldIn.avgCost.toFixed(4)}, Avg Latency: ${result.heldIn.avgLatencyMs.toFixed(0)}ms`,
    `  Regressed: ${result.heldIn.regressed ? 'YES' : 'NO'}`,
    '',
    'Held-out Split:',
    `  Tasks: ${result.heldOut.tasksRun}, Passed: ${result.heldOut.tasksPassed}, Pass Rate: ${(result.heldOut.passRate * 100).toFixed(1)}%`,
    `  Avg Cost: $${result.heldOut.avgCost.toFixed(4)}, Avg Latency: ${result.heldOut.avgLatencyMs.toFixed(0)}ms`,
    `  Regressed: ${result.heldOut.regressed ? 'YES' : 'NO'}`,
  ];

  return lines.join('\n');
}