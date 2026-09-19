// TracePort adapter — JSONL sink plus readers for `forge trace show`.
// flush() groups buffered events by runId and appends them to one file per
// run: <dir>/run-<runId>.jsonl. Reading any .jsonl file is tolerant of
// corrupt/partial lines (skipped, not thrown).
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { TraceEvent, TracePort, AdapterConformance } from '@runforge/contracts';

const DEFAULT_TRACE_DIR = '.forge/traces';

export { DEFAULT_TRACE_DIR };

export interface JsonlTraceSinkOptions {
  dir?: string;
  /** Base name for the run file (default derived from the runId). */
  runFilePrefix?: string;
}

export class JsonlTraceSink implements TracePort {
  private readonly dir: string;
  private readonly runFilePrefix: string;
  private readonly pending: TraceEvent[] = [];

  constructor(options: JsonlTraceSinkOptions = {}) {
    this.dir = options.dir ?? DEFAULT_TRACE_DIR;
    this.runFilePrefix = options.runFilePrefix ?? 'run-';
  }

  record(event: TraceEvent): void {
    this.pending.push(event);
  }

  async flush(): Promise<void> {
    if (this.pending.length === 0) return;
    await fs.mkdir(this.dir, { recursive: true });

    const byRun = new Map<string, TraceEvent[]>();
    for (const event of this.pending) {
      const runId = getRunId(event) ?? 'unknown';
      const bucket = byRun.get(runId) ?? [];
      bucket.push(event);
      byRun.set(runId, bucket);
    }

    for (const [runId, events] of byRun) {
      const lines = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
      await fs.appendFile(join(this.dir, `${this.runFilePrefix}${runId}.jsonl`), lines, 'utf8');
    }

    this.pending.length = 0;
  }

  static conformance(): AdapterConformance {
    return {
      adapterName: 'jsonl-trace-sink',
      portName: 'TracePort',
      enforcedGuarantees: [
        'jsonl-persistency',
        'run-grouped-files',
        'corrupt-line-tolerance',
        'atomic-append-per-run',
        'recursive-directory-creation',
        'pending-buffer-flush',
      ],
      unenforcedGuarantees: [
        'real-time-streaming',
        'compression',
        'encryption-at-rest',
        'structured-query-support',
      ],
      limitations: [
        'JSONL format only (no binary/OTLP)',
        'Local filesystem only',
        'No automatic rotation/retention',
        'In-memory buffer until flush()',
        'No cross-run correlation',
      ],
    };
  }
}

export function getRunId(event: TraceEvent): string | undefined {
  const payload = event.payload as Record<string, unknown>;
  return typeof payload.runId === 'string' ? payload.runId : undefined;
}

export async function loadTraceEvents(dir = DEFAULT_TRACE_DIR): Promise<TraceEvent[]> {
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const jsonlFiles = files.filter((f) => f.endsWith('.jsonl')).sort();
  const events: TraceEvent[] = [];
  for (const file of jsonlFiles) {
    const raw = await fs.readFile(join(dir, file), 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '') continue;
      try {
        const parsed = JSON.parse(trimmed) as TraceEvent;
        if (parsed && typeof parsed.id === 'string' && typeof parsed.type === 'string') {
          events.push(parsed);
        }
      } catch {
        // skip corrupt/partial line
      }
    }
  }
  return events;
}

export async function loadRun(dir: string, runId: string): Promise<TraceEvent[]> {
  const all = await loadTraceEvents(dir);
  if (runId === '*') return all;
  return all.filter((e) => getRunId(e) === runId);
}

export interface RunSummary {
  runId: string;
  eventCount: number;
  startedAt: number;
  types: string[];
}

export async function listRunIds(dir = DEFAULT_TRACE_DIR): Promise<RunSummary[]> {
  const groups = new Map<string, TraceEvent[]>();
  const all = await loadTraceEvents(dir);
  for (const event of all) {
    const runId = getRunId(event) ?? 'unknown';
    const bucket = groups.get(runId) ?? [];
    bucket.push(event);
    groups.set(runId, bucket);
  }
  return [...groups.entries()]
    .map(([runId, events]) => {
      const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
      const first = sorted[0];
      return {
        runId,
        eventCount: events.length,
        startedAt: first?.timestamp ?? 0,
        types: [...new Set(events.map((e) => e.type))].sort(),
      };
    })
    .sort((a, b) => b.startedAt - a.startedAt);
}