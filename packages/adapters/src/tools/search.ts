// Search tool family — a pure-TS ripgrep-style line search over the workspace
// (no external binary, works everywhere). Skips binary noise directories.
import { promises as fs } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { ToolCall, ToolContext, ToolDefinition, ToolResult } from '@forge/contracts';
import type { ToolFamily } from './types.js';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.forge', '.next', 'out']);
const MAX_FILE_BYTES = 500_000;
const MAX_MATCHES = 200;

export class SearchTool implements ToolFamily {
  readonly family = 'search';

  readonly tools: ToolDefinition[] = [
    {
      name: 'search',
      description: 'Search file contents in the workspace with a regular expression.',
      parameters: {
        pattern: { type: 'string', description: 'Regular expression to search for.' },
        path: { type: 'string', description: 'Optional subdirectory/file relative to the workspace root.' },
      },
    },
  ];

  async execute(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    if (call.name !== 'search' && call.name !== 'grep') {
      return { callId: call.id, output: '', error: `SearchTool: unsupported tool ${call.name}` };
    }
    const rawPattern = call.arguments.pattern;
    if (typeof rawPattern !== 'string' || rawPattern.trim() === '') {
      return { callId: call.id, output: '', error: 'SearchTool: "pattern" is required' };
    }
    let regex: RegExp;
    try {
      regex = new RegExp(rawPattern);
    } catch {
      return { callId: call.id, output: '', error: `SearchTool: invalid regular expression: ${rawPattern}` };
    }

    const base = typeof call.arguments.path === 'string' && call.arguments.path !== ''
      ? resolve(ctx.workspace, call.arguments.path)
      : ctx.workspace;

    const matches: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      if (matches.length >= MAX_MATCHES) return;
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (matches.length >= MAX_MATCHES) return;
        const child = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name)) continue;
          await walk(child);
        } else if (entry.isFile()) {
          await scanFile(child);
        }
      }
    };

    const scanFile = async (file: string): Promise<void> => {
      let stat;
      try {
        stat = await fs.stat(file);
      } catch {
        return;
      }
      if (stat.size > MAX_FILE_BYTES) return;
      let content: string;
      try {
        content = await fs.readFile(file, 'utf8');
      } catch {
        return; // binary / unreadable
      }
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (matches.length >= MAX_MATCHES) return;
        const line = lines[i];
        if (line !== undefined && regex.test(line)) {
          regex.lastIndex = 0;
          const rel = relative(ctx.workspace, file).replace(/\\/g, '/');
          matches.push(`${rel}:${i + 1}: ${line.slice(0, 400)}`);
        }
      }
    };

    await walk(base);

    return {
      callId: call.id,
      output: matches.length === 0 ? '(no matches)' : matches.join('\n'),
      metadata: { matches: matches.length },
    };
  }
}