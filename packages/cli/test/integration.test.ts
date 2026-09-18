// CLI composition-root integration tests (PHASED_PLAN Phase 3):
// - read → edit → run task via the scripted mock tool plan
// - forge trace show/list surface recorded model traffic (A12)
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { forgeRun } from '../src/index.js';
import { traceShow, traceList } from '../src/commands/trace.js';
import type { ToolCall } from '@forge/contracts';

describe('forgeRun integration — tools wired at the composition root', () => {
  it('executes a scripted read → edit → run task and materialises the change in the workspace', async () => {
    const ws = await fs.mkdtemp(join(tmpdir(), 'forge-cli-ws-'));
    const target = join(ws, 'bug.js');
    await fs.writeFile(target, 'function add(a, b) {\n  return a + b; // BUG keeps summing\n}\nmodule.exports = { add };\n', 'utf8');

    try {
      const plan: ToolCall[] = [
        { id: 't1', name: 'read_file', arguments: { path: 'bug.js' } },
        { id: 't2', name: 'edit_file', arguments: { path: 'bug.js', search: 'return a + b;', replace: 'return a * b;' } },
        { id: 't3', name: 'run_command', arguments: { command: `node -p "require('./bug.js').add(3, 4)"` } },
      ];

      const result = await forgeRun({
        task: 'fix multiply',
        mock: true,
        mockToolPlan: plan,
        workspace: ws,
        maxTurns: 10,
      });

      expect(result.completed).toBe(true);
      expect(result.turns).toBe(4); // three tool turns + one final stop turn

      const after = await fs.readFile(target, 'utf8');
      expect(after).toContain('return a * b;');
      expect(after).not.toContain('return a + b;');
    } finally {
      await fs.rm(ws, { recursive: true, force: true });
    }
  });

  it('records model traffic to the JSONL sink when trace:true and surfaces it via trace show/list', async () => {
    const traceDir = await fs.mkdtemp(join(tmpdir(), 'forge-cli-trace-'));
    try {
      const result = await forgeRun({
        task: 'say hello via trace',
        mock: true,
        trace: true,
        traceDir,
      });

      expect(result.runId).toBeDefined();

      const shown = await traceShow(result.runId!, traceDir);
      expect(shown).toContain(`Run ${result.runId}`);
      expect(shown).toContain('model request');
      expect(shown).toContain('model response');

      const listed = await traceList(traceDir);
      expect(listed).toContain(result.runId!);
    } finally {
      await fs.rm(traceDir, { recursive: true, force: true });
    }
  });

  it('reports an empty trace store honestly', async () => {
    const traceDir = await fs.mkdtemp(join(tmpdir(), 'forge-cli-trace-empty-'));
    try {
      expect(await traceShow('missing-run', traceDir)).toContain('No trace found');
      expect(await traceList(traceDir)).toBe('No traces recorded yet.');
    } finally {
      await fs.rm(traceDir, { recursive: true, force: true });
    }
  });
});