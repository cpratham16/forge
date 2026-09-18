// ContextPort contract tests (M7) — the filesystem-schema adapter returns a
// pack within the token budget, includes declared task inputs with a perfect
// relevance score, and extracts symbols and rules from the workspace.
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FilesystemContextAdapter } from '../../src/context/filesystem-schema.js';

async function withRepo<T>(files: Record<string, string>, fn: (root: string) => Promise<T>): Promise<T> {
  const root = await fs.mkdtemp(join(tmpdir(), 'forge-context-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      const abs = join(root, rel);
      await fs.mkdir(join(abs, '..'), { recursive: true });
      await fs.writeFile(abs, content, 'utf8');
    }
    return await fn(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

describe('FilesystemContextAdapter', () => {
  it('includes declared task inputs with relevance 1 and stays within the token budget', async () => {
    await withRepo(
      {
        'src/util.ts': 'export function double(x: number): number { return x * 2; }\n',
        'src/other.ts': 'export const unused = 1;\n',
        'AGENTS.md': '# rules\nReply tersely.\n',
      },
      async (root) => {
        const adapter = new FilesystemContextAdapter({ tokenBudget: 4000, maxFiles: 5 });
        const pack = await adapter.build(
          { id: 'task-1', objective: 'reimplement double', inputs: { files: ['src/util.ts'] } },
          { root },
        );

        // Declared input present, first, and perfectly relevant.
        expect(pack.files.length).toBeGreaterThan(0);
        expect(pack.files[0]!.path).toBe('src/util.ts');
        expect(pack.files[0]!.relevanceScore).toBe(1);
        expect(pack.files[0]!.content).toContain('export function double');

        // Symbol extraction finds the exported function.
        expect(pack.symbols.some((s) => s.name === 'double' && s.kind === 'function')).toBe(true);

        // AGENTS.md rules are surfaced.
        expect(pack.rules.some((r) => r.source === 'AGENTS.md')).toBe(true);

        // Token budget honoured.
        expect(pack.tokensUsed).toBeLessThanOrEqual(pack.tokenBudget);
        expect(pack.taskId).toBe('task-1');
      },
    );
  });

  it('scores un-declared files by objective overlap and caps files by maxFiles', async () => {
    await withRepo(
      {
        'a.ts': 'export const alpha = 1;\n',
        'b.ts': 'export const beta = 2;\n',
        'deep/also.ts': 'export const also = 3;\n',
      },
      async (root) => {
        const adapter = new FilesystemContextAdapter({ tokenBudget: 100_000, maxFiles: 2 });
        const pack = await adapter.build({ id: 't', objective: 'alpha' }, { root });

        expect(pack.files.length).toBe(2);
        expect(pack.files[0]!.path).toBe('a.ts');
        expect(pack.files[0]!.relevanceScore).toBeGreaterThan(pack.files[1]!.relevanceScore);
      },
    );
  });

  it('refuses declared inputs that escape the repo root', async () => {
    await withRepo({ 'stay.ts': 'export const x = 1;\n' }, async (root) => {
      const adapter = new FilesystemContextAdapter({ cwd: root });
      const pack = await adapter.build(
        { id: 't', objective: 'x', inputs: { files: ['../escape.ts'] } },
        { root: '' },
      );
      expect(pack.files.every((f) => !f.path.includes('..'))).toBe(true);
    });
  });

  it('tolerates an empty non-repo cwd', async () => {
    const adapter = new FilesystemContextAdapter({ cwd: tmpdir() });
    const pack = await adapter.build({ id: 't', objective: '' }, {});
    expect(Array.isArray(pack.files)).toBe(true);
  });
});