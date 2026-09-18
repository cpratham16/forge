// ToolPort contract tests (M5) — suite runs against the ToolRegistry composed
// from the filesystem / shell / git / search families, exercising read → edit →
// rerun shape plus path confinement and registry guarantees.
import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { ToolCall, ToolContext, ToolPort } from '@forge/contracts';
import { ToolRegistry } from '../../src/tools/registry.js';
import { FilesystemTool } from '../../src/tools/filesystem.js';
import { ShellTool } from '../../src/tools/shell.js';
import { GitTool } from '../../src/tools/git.js';
import { SearchTool } from '../../src/tools/search.js';

const execFileAsync = promisify(execFile);

async function withWorkspace<T>(fn: (ws: string, port: ToolPort) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(join(tmpdir(), 'forge-tools-'));
  try {
    const registry = new ToolRegistry([new FilesystemTool(), new ShellTool(), new GitTool(), new SearchTool()]);
    const ctx: ToolContext = { workspace: dir, permissions: { outcome: 'allow', rationale: 'test' } };
    const run = (call: ToolCall) => registry.execute(call, ctx);
    return await fn(dir, { execute: run } as ToolPort);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe('ToolRegistry composition', () => {
  it('exposes flattened definitions and dispatches to the owning family', () => {
    const registry = new ToolRegistry([new FilesystemTool(), new ShellTool()]);
    const names = registry.toolDefinitions().map((t) => t.name);
    expect(names).toContain('read_file');
    expect(names).toContain('run_command');
    expect(registry.has('read_file')).toBe(true);
    expect(registry.has('nope')).toBe(false);
  });

  it('throws on duplicate tool names', () => {
    expect(() => new ToolRegistry([new FilesystemTool(), new FilesystemTool()])).toThrow(/duplicate tool name/);
  });

  it('returns an error result for unknown tools without throwing', async () => {
    const registry = new ToolRegistry([new FilesystemTool()]);
    const result = await registry.execute({ id: 'x', name: 'not_a_tool', arguments: {} }, {
      workspace: '.',
      permissions: { outcome: 'allow', rationale: 'test' },
    });
    expect(result.error).toContain('Unknown tool');
  });
});

describe('filesystem tools', () => {
  it('writes and round-trips a file (read after write)', async () => {
    await withWorkspace(async (ws, port) => {
      const write = await port.execute({ id: 'w', name: 'write_file', arguments: { path: 'src/a.txt', content: 'hello forge' } }, {
        workspace: ws,
        permissions: { outcome: 'allow', rationale: 't' },
      });
      expect(write.error).toBeUndefined();

      const read = await port.execute({ id: 'r', name: 'read_file', arguments: { path: 'src/a.txt' } }, {
        workspace: ws,
        permissions: { outcome: 'allow', rationale: 't' },
      });
      expect(read.output).toBe('hello forge');
    });
  });

  it('edits the first occurrence and lists directory entries', async () => {
    await withWorkspace(async (ws, port) => {
      const ctx = { workspace: ws, permissions: { outcome: 'allow' as const, rationale: 't' } };
      await port.execute({ id: 'w', name: 'write_file', arguments: { path: 'app.js', content: 'const x = 1;\n' } }, ctx);

      const edit = await port.execute({ id: 'e', name: 'edit_file', arguments: { path: 'app.js', search: 'const x', replace: 'const y' } }, ctx);
      expect(edit.error).toBeUndefined();
      const read = await port.execute({ id: 'r', name: 'read_file', arguments: { path: 'app.js' } }, ctx);
      expect(read.output).toContain('const y = 1;');

      const list = await port.execute({ id: 'l', name: 'list_files', arguments: { path: '.', recursive: true } }, ctx);
      expect(list.output).toContain('app.js');
    });
  });

  it('refuses path traversal outside the workspace', async () => {
    await withWorkspace(async (ws, port) => {
      const ctx = { workspace: ws, permissions: { outcome: 'allow' as const, rationale: 't' } };
      const result = await port.execute({ id: 's', name: 'read_file', arguments: { path: '../outside.txt' } }, ctx);
      expect(result.error).toContain('outside workspace');
    });
  });

  it('deletes a file', async () => {
    await withWorkspace(async (ws, port) => {
      const ctx = { workspace: ws, permissions: { outcome: 'allow' as const, rationale: 't' } };
      await port.execute({ id: 'w', name: 'write_file', arguments: { path: 'tmp.txt', content: 'x' } }, ctx);
      const del = await port.execute({ id: 'd', name: 'delete_file', arguments: { path: 'tmp.txt' } }, ctx);
      expect(del.error).toBeUndefined();
      const read = await port.execute({ id: 'r', name: 'read_file', arguments: { path: 'tmp.txt' } }, ctx);
      expect(read.error).toBeDefined();
    });
  });
});

describe('shell tools', () => {
  it('runs a command and captures stdout', async () => {
    await withWorkspace(async (ws, port) => {
      const ctx = { workspace: ws, permissions: { outcome: 'allow' as const, rationale: 't' } };
      const result = await port.execute({ id: 's', name: 'run_command', arguments: { command: 'node -p "40+2"' } }, ctx);
      expect(result.error).toBeUndefined();
      expect(result.output.trim()).toBe('42');
    });
  });

  it('reports a non-zero exit as an error result', async () => {
    await withWorkspace(async (ws, port) => {
      const ctx = { workspace: ws, permissions: { outcome: 'allow' as const, rationale: 't' } };
      const result = await port.execute({ id: 's', name: 'run_command', arguments: { command: 'node -e "process.exit(3)"' } }, ctx);
      expect(result.error).toContain('exit 3');
      expect(result.metadata?.exitCode).toBe(3);
    });
  });
});

describe('search tools', () => {
  it('finds matching lines with file:line context', async () => {
    await withWorkspace(async (ws, port) => {
      const ctx = { workspace: ws, permissions: { outcome: 'allow' as const, rationale: 't' } };
      await port.execute({ id: 'w', name: 'write_file', arguments: { path: 'lib/keep.ts', content: 'export function keepalive() {}\n' } }, ctx);

      const result = await port.execute({ id: 's', name: 'search', arguments: { pattern: 'keepalive' } }, ctx);
      expect(result.error).toBeUndefined();
      expect(result.output).toContain('lib/keep.ts:1');
    });
  });

  it('reports invalid regex as an error, not a throw', async () => {
    await withWorkspace(async (ws, port) => {
      const ctx = { workspace: ws, permissions: { outcome: 'allow' as const, rationale: 't' } };
      const result = await port.execute({ id: 's', name: 'search', arguments: { pattern: '(' } }, ctx);
      expect(result.error).toContain('invalid regular expression');
    });
  });
});

describe('git tools', () => {
  it('reports git failures as tool errors in non-repo workspaces', async () => {
    await withWorkspace(async (ws, port) => {
      const ctx = { workspace: ws, permissions: { outcome: 'allow' as const, rationale: 't' } };
      const result = await port.execute({ id: 'g', name: 'git', arguments: { args: ['status'] } }, ctx);
      expect(result.error).toBeDefined();
    });
  });

  it('runs git_status and git_log against a real repository', async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'forge-git-'));
    try {
      await writeFile(join(dir, 'f.txt'), 'x');
      await execFileAsync('git', ['init', '-q'], { cwd: dir });
      await execFileAsync('git', ['add', '.'], { cwd: dir });
      await execFileAsync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'test commit'], { cwd: dir });

      const registry = new ToolRegistry([new GitTool()]);
      const ctx: ToolContext = { workspace: dir, permissions: { outcome: 'allow', rationale: 'test' } };

      const status = await registry.execute({ id: 's', name: 'git_status', arguments: {} }, ctx);
      expect(status.error).toBeUndefined();
      expect(status.output).toContain('## main');

      const log = await registry.execute({ id: 'l', name: 'git_log', arguments: { limit: 5 } }, ctx);
      expect(log.output).toContain('test commit');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

async function writeFile(path: string, content: string): Promise<void> {
  await fs.mkdir(join(path, '..'), { recursive: true });
  await fs.writeFile(path, content, 'utf8');
}