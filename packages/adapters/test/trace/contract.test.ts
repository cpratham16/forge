// TracePort contract tests (M8/A12) — JSONL sink round-trips events, groups by
// run id, survives corrupt lines, and feeds `forge trace show/list`.
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TraceEvent } from '@forge/contracts';
import { JsonlTraceSink, loadTraceEvents, loadRun, listRunIds, getRunId } from '../../src/trace/jsonl.js';

function event(runId: string, type: TraceEvent['type'], overrides: Partial<TraceEvent> = {}): TraceEvent {
  return {
    id: `${type}-${Math.random().toString(36).slice(2)}`,
    timestamp: Date.now(),
    type,
    agent: 'main',
    payload: { runId },
    ...overrides,
  };
}

describe('JsonlTraceSink', () => {
  it('appends events grouped by run id and round-trips them through loadTraceEvents', async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'forge-trace-'));
    try {
      const sink = new JsonlTraceSink({ dir });
      const request = event('run-a', 'model.request');
      const response = event('run-a', 'model.response', { parentId: request.id });
      const other = event('run-b', 'run.outcome');

      sink.record(request);
      sink.record(response);
      sink.record(other);
      await sink.flush();

      const all = await loadTraceEvents(dir);
      expect(all).toHaveLength(3);
      expect(getRunId(all[0]!)).toBe('run-a');

      const runA = await loadRun(dir, 'run-a');
      expect(runA).toHaveLength(2);

      const summaries = await listRunIds(dir);
      expect(summaries.map((s) => s.runId).sort()).toEqual(['run-a', 'run-b']);
      expect(summaries.find((s) => s.runId === 'run-a')?.types).toContain('model.request');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('skips corrupt lines instead of throwing while reading', async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'forge-trace-corrupt-'));
    try {
      const sink = new JsonlTraceSink({ dir });
      sink.record(event('run-c', 'run.outcome'));
      await sink.flush();

      await fs.appendFile(join(dir, 'run-run-c.jsonl'), '{not json\n{"partially":"broken\n', 'utf8');

      const all = await loadTraceEvents(dir);
      expect(all).toHaveLength(1);
      expect(all[0]!.type).toBe('run.outcome');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('flush is a no-op with nothing pending', async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'forge-trace-empty-'));
    try {
      const sink = new JsonlTraceSink({ dir });
      await sink.flush();
      expect((await loadTraceEvents(dir)).length).toBe(0);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});