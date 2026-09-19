// VerificationPort adapter — runs a fixed sequence of shell commands
// (build/test/lint/dep-check) and produces evidence-based VerificationResult.
//
// A3: with zero commands configured there is no evidence, so the result is
// status 'not_observed' — never 'verified'.
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { Evidence, VerificationPort, VerificationResult, AdapterConformance } from '@runforge/contracts';

const execAsync = promisify(exec);
const MAX_BUFFER = 10 * 1024 * 1024;

export interface VerifierCommand {
  label: string;
  command: string;
}

export interface ShellCommandVerifierOptions {
  commands: VerifierCommand[];
  repoRoot?: string;
  timeoutMs?: number;
  taskId?: string;
}

function evidenceTypeForLabel(label: string): Evidence['type'] {
  const l = label.toLowerCase();
  if (l.includes('build') || l.includes('compile')) return 'build_passed';
  if (l.includes('lint') || l.includes('eslint')) return 'lint_passed';
  if (l.includes('dep') || l.includes('check')) return 'dependency_check_passed';
  return 'test_passed';
}

export class ShellCommandVerifier implements VerificationPort {
  private readonly options: ShellCommandVerifierOptions;

  constructor(options: ShellCommandVerifierOptions) {
    this.options = options;
  }

  async verify(task: unknown, _output: unknown): Promise<VerificationResult> {
    const taskId =
      typeof task === 'object' && task !== null && typeof (task as { id?: unknown }).id === 'string'
        ? (task as { id: string }).id
        : this.options.taskId ?? 'task';

    if (this.options.commands.length === 0) {
      return {
        taskId,
        status: 'not_observed',
        evidence: [],
        timestamp: Date.now(),
        readinessLevel: 'draft',
      };
    }

    const evidence: Evidence[] = [];
    let failed = false;

    for (const command of this.options.commands) {
      try {
        await execAsync(command.command, {
          cwd: this.options.repoRoot ?? '.',
          timeout: this.options.timeoutMs ?? 120_000,
          maxBuffer: MAX_BUFFER,
          windowsHide: true,
        });
        evidence.push({
          type: evidenceTypeForLabel(command.label),
          detail: `${command.label} passed`,
          command: command.command,
          timestamp: Date.now(),
        });
      } catch (e) {
        failed = true;
        const stderr = (e as { stderr?: string | Buffer }).stderr;
        const detail = stderr !== undefined
          ? Buffer.isBuffer(stderr) ? stderr.toString().trim().slice(0, 2000) : stderr.trim().slice(0, 2000)
          : 'command failed';
        evidence.push({
          type: evidenceTypeForLabel(command.label),
          detail: `${command.label} failed: ${detail}`,
          command: command.command,
          timestamp: Date.now(),
        });
      }
    }

    return {
      taskId,
      status: failed ? 'failed' : 'verified',
      evidence,
      timestamp: Date.now(),
      readinessLevel: failed ? 'draft' : 'pr-ready',
    };
  }

  static conformance(): AdapterConformance {
    return {
      adapterName: 'shell-command-verifier',
      portName: 'VerificationPort',
      enforcedGuarantees: [
        'command-sequence-execution',
        'evidence-collection-per-command',
        'not-observed-for-empty-commands',
        'failed-status-on-any-failure',
        'verified-status-on-all-success',
        'readiness-level-mapping',
        'per-command-timeout',
        'buffer-size-limit',
      ],
      unenforcedGuarantees: [
        'command-ordering-guarantees',
        'parallel-execution-support',
        'retry-on-failure',
      ],
      limitations: [
        'Sequential execution only',
        'Single timeout for all commands',
        'No parallel execution',
        'No retry logic',
        'Max buffer 10MB',
        'Timeout defaults to 120s',
      ],
    };
  }
}