// Shell tool family — runs arbitrary commands via the node child_process.
// Command-level security (force push, --no-verify, secrets…) is enforced
// upstream by the PolicyToolDecorator + RUNTIME_FLOOR, not here.
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import type { ToolCall, ToolContext, ToolDefinition, ToolResult, AdapterConformance } from '@runforge/contracts';
import type { ToolFamily } from './types.js';

const execAsync = promisify(exec);
const MAX_BUFFER = 10 * 1024 * 1024;

export class ShellTool implements ToolFamily {
  readonly family = 'shell';

  readonly tools: ToolDefinition[] = [
    {
      name: 'run_command',
      description: 'Run a shell command in the workspace and return its output.',
      parameters: {
        command: { type: 'string', description: 'The command line to run.' },
        cwd: { type: 'string', description: 'Optional working directory relative to the workspace root.' },
        timeoutMs: { type: 'number', description: 'Optional timeout in milliseconds (default 30000).' },
      },
    },
  ];

  async execute(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    if (call.name !== 'run_command') {
      return { callId: call.id, output: '', error: `ShellTool: unsupported tool ${call.name}` };
    }
    const command = call.arguments.command;
    if (typeof command !== 'string' || command.trim() === '') {
      return { callId: call.id, output: '', error: 'ShellTool: "command" is required' };
    }
    const cwd = typeof call.arguments.cwd === 'string' && call.arguments.cwd !== ''
      ? join(ctx.workspace, call.arguments.cwd)
      : ctx.workspace;
    const timeoutMs = typeof call.arguments.timeoutMs === 'number' ? call.arguments.timeoutMs : 30_000;

    try {
      const { stdout } = await execAsync(command, {
        cwd,
        timeout: timeoutMs,
        maxBuffer: MAX_BUFFER,
        windowsHide: true,
      });
      return { callId: call.id, output: stdout, metadata: { exitCode: 0 } };
    } catch (e) {
      const failure = e as { stdout?: string | Buffer; stderr?: string | Buffer; code?: number | null; message?: string };
      const stderr = Buffer.isBuffer(failure.stderr) ? failure.stderr.toString() : (failure.stderr ?? '');
      const stdout = Buffer.isBuffer(failure.stdout) ? failure.stdout.toString() : (failure.stdout ?? '');
      const detail = stderr.trim() !== '' ? stderr.trim() : (failure.message ?? 'unknown error');
      return {
        callId: call.id,
        output: stdout,
        error: `exit ${failure.code ?? '?'}: ${detail}`,
        metadata: { exitCode: failure.code ?? -1 },
      };
    }
  }

  static conformance(): AdapterConformance {
    return {
      adapterName: 'shell',
      portName: 'ToolPort',
      enforcedGuarantees: [
        'command-execution',
        'stdout-capture',
        'stderr-capture',
        'exit-code-reporting',
        'timeout-enforcement',
        'working-directory-isolation',
        'buffer-size-limit',
      ],
      unenforcedGuarantees: [
        'command-sanitization',
        'environment-isolation',
        'resource-limits',
      ],
      limitations: [
        'No shell builtin support (uses exec, not shell)',
        'Max buffer 10MB',
        'Default timeout 30s',
        'Windows: windowsHide true',
      ],
    };
  }
}