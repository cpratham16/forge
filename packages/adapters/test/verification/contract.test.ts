// VerificationPort contract tests (M6) — the shell-command adapter produces
// evidence from real command runs, and produces 'not_observed' when nothing
// ran (A3).
import { describe, it, expect } from 'vitest';
import { ShellCommandVerifier, type VerifierCommand } from '../../src/verification/shell-command.js';

describe('ShellCommandVerifier', () => {
  it('returns not_observed with no evidence when zero commands are configured (A3)', async () => {
    const verifier = new ShellCommandVerifier({ commands: [] });
    const result = await verifier.verify({ id: 't1' }, 'some output');

    expect(result.status).toBe('not_observed');
    expect(result.evidence).toHaveLength(0);
    expect(result.readinessLevel).toBe('draft');
  });

  it('passes with pushable evidence when every command succeeds', async () => {
    const commands: VerifierCommand[] = [
      { label: 'node version probe', command: 'node -v' },
      { label: 'arithmetic smoke test', command: 'node -p "1+1"' },
    ];
    const verifier = new ShellCommandVerifier({ commands });
    const result = await verifier.verify({ id: 't2' }, 'output');

    expect(result.status).toBe('verified');
    expect(result.evidence).toHaveLength(2);
    expect(result.evidence[0]!.type).toBe('test_passed');
    expect(result.evidence[0]!.command).toBe('node -v');
    expect(result.readinessLevel).toBe('pr-ready');
  });

  it('fails with evidence when a command exits non-zero', async () => {
    const commands: VerifierCommand[] = [
      { label: 'build', command: 'node -p "1+1"' },
      { label: 'tests', command: 'node -e "process.exit(1)"' },
    ];
    const verifier = new ShellCommandVerifier({ commands });
    const result = await verifier.verify({ id: 't3' }, 'output');

    expect(result.status).toBe('failed');
    expect(result.readinessLevel).toBe('draft');
    expect(result.evidence.some((e) => e.detail.includes('tests failed'))).toBe(true);
    expect(result.evidence.some((e) => e.type === 'test_passed')).toBe(true);
  });

  it('uses the configured taskId when the task has no id', async () => {
    const verifier = new ShellCommandVerifier({ commands: [{ label: 'ok', command: 'node -v' }], taskId: 'fallback-task' });
    const result = await verifier.verify('plain string task', 'out');
    expect(result.taskId).toBe('fallback-task');
  });
});