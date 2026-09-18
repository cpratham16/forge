// Git tool family — read-mostly git operations plus a generic 'git' tool.
// execFile with argv arrays, so no shell interpolation. Uses the workspace as
// the git working directory.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ToolCall, ToolContext, ToolDefinition, ToolResult } from '@forge/contracts';
import type { ToolFamily } from './types.js';

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 10 * 1024 * 1024;

export class GitTool implements ToolFamily {
  readonly family = 'git';

  readonly tools: ToolDefinition[] = [
    {
      name: 'git',
      description: 'Run an arbitrary git command in the workspace (argv form, no shell).',
      parameters: { args: { type: 'array', description: 'Git subcommand and arguments, e.g. ["status", "--porcelain"]' } },
    },
    {
      name: 'git_status',
      description: 'Show the working tree status (porcelain).',
      parameters: {},
    },
    {
      name: 'git_diff',
      description: 'Show changes in the working tree (stat).',
      parameters: {},
    },
    {
      name: 'git_log',
      description: 'Show recent commit history (oneline).',
      parameters: { limit: { type: 'number', description: 'Number of commits to show (default 20).' } },
    },
  ];

  async execute(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    const baseArgs: string[] = ['-C', ctx.workspace];
    let args: string[];

    switch (call.name) {
      case 'git': {
        const raw = call.arguments.args;
        if (!Array.isArray(raw) || raw.length === 0) {
          return { callId: call.id, output: '', error: 'GitTool: "args" is required' };
        }
        args = raw.map(String);
        break;
      }
      case 'git_status':
        args = ['status', '--porcelain=v1', '-b'];
        break;
      case 'git_diff':
        args = ['diff', '--stat'];
        break;
      case 'git_log': {
        const limit = typeof call.arguments.limit === 'number' ? call.arguments.limit : 20;
        args = ['log', `-n`, String(limit), '--oneline'];
        break;
      }
      default:
        return { callId: call.id, output: '', error: `GitTool: unsupported tool ${call.name}` };
    }

    try {
      const { stdout } = await execFileAsync('git', [...baseArgs, ...args], {
        maxBuffer: MAX_BUFFER,
        windowsHide: true,
      });
      return { callId: call.id, output: stdout, metadata: { exitCode: 0, argv: args } };
    } catch (e) {
      const failure = e as { stderr?: string | Buffer; code?: number | null; message?: string };
      const stderr = Buffer.isBuffer(failure.stderr) ? failure.stderr.toString() : (failure.stderr ?? '');
      return {
        callId: call.id,
        output: '',
        error: `git ${args.join(' ')} — ${(stderr.trim() || (failure.message ?? 'unknown error')).slice(0, 2000)}`,
        metadata: { exitCode: failure.code ?? -1 },
      };
    }
  }
}