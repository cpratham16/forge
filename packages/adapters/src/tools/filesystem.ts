// Filesystem tool family — read/write/list/edit/delete within a workspace.
// All paths are resolved against ctx.workspace and confined to it: path
// traversal outside the workspace is refused with a tool error (security is
// also enforced upstream by the PolicyToolDecorator).
import { promises as fs } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { ToolCall, ToolContext, ToolDefinition, ToolResult } from '@forge/contracts';
import type { ToolFamily } from './types.js';

const MAX_READ_CHARS = 200_000;

function err(callId: string, message: string): ToolResult {
  return { callId, output: '', error: message };
}

function withinWorkspace(workspace: string, candidate: string): boolean {
  const rel = relative(resolve(workspace), candidate);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export class FilesystemTool implements ToolFamily {
  readonly family = 'filesystem';

  readonly tools: ToolDefinition[] = [
    {
      name: 'list_files',
      description: 'List files in a directory within the workspace.',
      parameters: {
        path: { type: 'string', description: 'Directory path relative to the workspace root.' },
        recursive: { type: 'boolean', description: 'List recursively when true.' },
      },
    },
    {
      name: 'read_file',
      description: 'Read a file within the workspace.',
      parameters: { path: { type: 'string', description: 'File path relative to the workspace root.' } },
    },
    {
      name: 'write_file',
      description: 'Create or overwrite a file within the workspace.',
      parameters: {
        path: { type: 'string', description: 'File path relative to the workspace root.' },
        content: { type: 'string', description: 'Full file content.' },
      },
    },
    {
      name: 'edit_file',
      description: 'Replace the first occurrence of `search` with `replace` in a file.',
      parameters: {
        path: { type: 'string', description: 'File path relative to the workspace root.' },
        search: { type: 'string', description: 'Exact text to find.' },
        replace: { type: 'string', description: 'Replacement text.' },
      },
    },
    {
      name: 'delete_file',
      description: 'Delete a file within the workspace.',
      parameters: { path: { type: 'string', description: 'File path relative to the workspace root.' } },
    },
  ];

  async execute(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    switch (call.name) {
      case 'list_files':
        return this.listFiles(call, ctx);
      case 'read_file':
        return this.readFile(call, ctx);
      case 'write_file':
        return this.writeFile(call, ctx);
      case 'edit_file':
        return this.editFile(call, ctx);
      case 'delete_file':
        return this.deleteFile(call, ctx);
      default:
        return err(call.id, `FilesystemTool: unsupported tool ${call.name}`);
    }
  }

  private resolvePath(call: ToolCall, ctx: ToolContext, label = 'path'): { path?: string; error?: ToolResult } {
    const raw = call.arguments[label];
    if (typeof raw !== 'string' || raw.trim() === '') {
      return { error: err(call.id, `FilesystemTool: "${label}" is required`) };
    }
    const resolved = isAbsolute(raw) ? resolve(raw) : resolve(ctx.workspace, raw);
    if (!withinWorkspace(ctx.workspace, resolved)) {
      return { error: err(call.id, `FilesystemTool: path outside workspace: ${raw}`) };
    }
    return { path: resolved };
  }

  private async listFiles(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    const { path, error } = this.resolvePath(call, ctx);
    if (error) return error;
    const recursive = call.arguments.recursive === true;

    const entries: string[] = [];
    const walk = async (dir: string, depth: number): Promise<void> => {
      const items = await fs.readdir(dir, { withFileTypes: true });
      for (const item of items) {
        const child = join(dir, item.name);
        if (item.isDirectory()) {
          if (recursive && depth <= 8) await walk(child, depth + 1);
        } else {
          entries.push(relative(ctx.workspace, child).replace(/\\/g, '/'));
        }
      }
    };

    try {
      await walk(path ?? ctx.workspace, 0);
    } catch (e) {
      return err(call.id, `FilesystemTool: ${e instanceof Error ? e.message : String(e)}`);
    }
    entries.sort();
    return { callId: call.id, output: entries.length === 0 ? '(empty directory)' : entries.join('\n'), metadata: { count: entries.length } };
  }

  private async readFile(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    const { path, error } = this.resolvePath(call, ctx);
    if (error) return error;
    try {
      const stat = await fs.stat(path!);
      if (stat.size > MAX_READ_CHARS) {
        return err(call.id, `FilesystemTool: file too large to read (${stat.size} bytes)`);
      }
      const content = await fs.readFile(path!, 'utf8');
      return {
        callId: call.id,
        output: content,
        metadata: { path: relative(ctx.workspace, path!).replace(/\\/g, '/'), bytes: content.length },
      };
    } catch (e) {
      return err(call.id, `FilesystemTool: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async writeFile(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    const { path, error } = this.resolvePath(call, ctx);
    if (error) return error;
    const content = call.arguments.content;
    if (typeof content !== 'string') return err(call.id, 'FilesystemTool: "content" is required');

    try {
      await fs.mkdir(join(path!, '..'), { recursive: true });
      await fs.writeFile(path!, content, 'utf8');
      return {
        callId: call.id,
        output: `Wrote ${relative(ctx.workspace, path!).replace(/\\/g, '/')} (${content.length} chars)`,
        metadata: { path: relative(ctx.workspace, path!).replace(/\\/g, '/'), bytes: content.length },
      };
    } catch (e) {
      return err(call.id, `FilesystemTool: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async editFile(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    const { path, error } = this.resolvePath(call, ctx);
    if (error) return error;
    const search = call.arguments.search;
    const replace = call.arguments.replace;
    if (typeof search !== 'string' || typeof replace !== 'string') {
      return err(call.id, 'FilesystemTool: "search" and "replace" are required');
    }
    try {
      const content = await fs.readFile(path!, 'utf8');
      const index = content.indexOf(search);
      if (index === -1) {
        return err(call.id, `FilesystemTool: search text not found in ${relative(ctx.workspace, path!).replace(/\\/g, '/')}`);
      }
      const updated = content.slice(0, index) + replace + content.slice(index + search.length);
      await fs.writeFile(path!, updated, 'utf8');
      return { callId: call.id, output: `Edited ${relative(ctx.workspace, path!).replace(/\\/g, '/')}`, metadata: { replaced: search.length, added: replace.length } };
    } catch (e) {
      return err(call.id, `FilesystemTool: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async deleteFile(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    const { path, error } = this.resolvePath(call, ctx);
    if (error) return error;
    try {
      await fs.unlink(path!);
      return { callId: call.id, output: `Deleted ${relative(ctx.workspace, path!).replace(/\\/g, '/')}` };
    } catch (e) {
      return err(call.id, `FilesystemTool: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}