// Self-improvement acceptance tests (PHASED_PLAN Phase 7 v1.0 gate: >= 3
// accepted edits passing hold-in/hold-out regression validation).
// An edit is accepted only when at least one split improves and neither
// regresses. The loop must drive validation from its heldIn/heldOut/harnessRunner
// options, not from a hardcoded mock.
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  RegressionValidator,
  createDefaultValidator,
  runSelfImprovementLoop,
} from '../../src/index.js';
import type { TaskSpec } from '../../src/index.js';

function makeSpec(id: string): TaskSpec {
  return { id, objective: `objective-${id}`, expectedOutcome: 'done', verificationCommands: ['echo ok'] };
}

const HELD_IN = [makeSpec('in-a'), makeSpec('in-b')];
const HELD_OUT = [makeSpec('out-a')];

describe('RegressionValidator acceptance of held-in/held-out validated edits', () => {
  it('accepts at least three edits that improve a split without regression', async () => {
    const validator = createDefaultValidator(
      async (_task, proposal) => {
        if (proposal?.description === 'unstable') return { passed: false, cost: 1, latencyMs: 1 };
        return { passed: true, cost: 1, latencyMs: 1 };
      },
      HELD_IN,
      HELD_OUT,
    );

    const results = await Promise.all(
      ['improve-1', 'improve-2', 'improve-3', 'unstable'].map((id) =>
        validator.evaluate({ id, diff: id }),
      ),
    );

    const accepted = results.filter((r) => r.accepted);
    expect(accepted.length).toBeGreaterThanOrEqual(3);

    const rejected = results.find((r) => r.proposalId === 'unstable');
    expect(rejected?.accepted).toBe(false);
    expect(rejected?.reason).toContain('regressed');
  });

  it('rejects an edit that passes a split but regresses nothing while improving none', async () => {
    const validator = new RegressionValidator({
      heldInTasks: HELD_IN,
      heldOutTasks: [],
      harnessRunner: async () => ({ passed: false, cost: 1, latencyMs: 1 }),
    });
    const result = await validator.evaluate({ id: 'noop', diff: 'noop' });
    expect(result.accepted).toBe(false);
  });
});

describe('runSelfImprovementLoop uses its options', () => {
  it('validates proposals against the supplied hold-in/hold-out splits with the supplied harness runner', async () => {
    const traceDir = await fs.mkdtemp(join(tmpdir(), 'forge-si-trace-'));
    const proposalsDir = await fs.mkdtemp(join(tmpdir(), 'forge-si-proposals-'));
    try {
      // One failing run is enough for weakness mining to emit a proposal.
      const failingRun = [
        { id: 'a1', timestamp: 1, type: 'model.response', agent: 'developer', payload: { runId: 'run-si-1', usage: { inputTokens: 100, outputTokens: 50 } } },
        { id: 'a2', timestamp: 2, type: 'tool.call', agent: 'developer', payload: { runId: 'run-si-1', name: 'edit_file' } },
        { id: 'a3', timestamp: 3, type: 'verification.result', agent: 'developer', payload: { runId: 'run-si-1', status: 'failed', evidence: [] } },
      ];
      await fs.writeFile(join(traceDir, 'run-run-si-1.jsonl'), failingRun.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');

      const seenTasks: string[] = [];
      const result = await runSelfImprovementLoop({
        traceDir,
        proposalsDir,
        heldInTasks: [makeSpec('in-loop')],
        heldOutTasks: [makeSpec('out-loop')],
        harnessRunner: async (task) => {
          seenTasks.push(task.id);
          return { passed: true, cost: 1, latencyMs: 10 };
        },
        maxRounds: 1,
      });

      expect(result.totalProposals).toBeGreaterThan(0);
      expect(result.totalAccepted).toBeGreaterThan(0);
      // Both splits were actually exercised through the caller's runner.
      expect(seenTasks.sort()).toEqual(['in-loop', 'out-loop']);
    } finally {
      await fs.rm(traceDir, { recursive: true, force: true });
      await fs.rm(proposalsDir, { recursive: true, force: true });
    }
  });
});