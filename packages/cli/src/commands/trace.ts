// `forge trace show <run-id>` and `forge trace list` — human-readable trace
// summaries from JSONL sink files. No OTLP wiring for now (ADR-005 keeps that
// option for Phase 6); JSONL is sufficient for local inspection.
import { DEFAULT_TRACE_DIR, listRunIds, loadRun, type RunSummary } from '@runforge/adapters';
import type { TraceEvent } from '@runforge/contracts';

function padTwo(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatTime(ts: number): string {
  if (ts === 0) return '??:??:??';
  const d = new Date(ts);
  return `${padTwo(d.getHours())}:${padTwo(d.getMinutes())}:${padTwo(d.getSeconds())}`;
}

function eventSummary(event: TraceEvent): string {
  const payload = event.payload as Record<string, unknown>;
  switch (event.type) {
    case 'model.request': {
      const tools = Array.isArray(payload.tools) ? payload.tools.join(', ') : '';
      return `model request (${tools === '' ? 'no tools' : tools})`;
    }
    case 'model.response': {
      const finishReason = typeof payload.finishReason === 'string' ? payload.finishReason : '?';
      const usage = payload.usage as { inputTokens?: number; outputTokens?: number } | undefined;
      const usageStr = usage ? `${usage.inputTokens ?? 0} in / ${usage.outputTokens ?? 0} out` : '';
      return `model response — finishReason: ${finishReason}${usageStr !== '' ? `, ${usageStr}` : ''}`;
    }
    case 'run.outcome':
      return `run outcome: ${JSON.stringify(payload).slice(0, 200)}`;
    case 'tool.call':
      return `tool call: ${typeof payload.name === 'string' ? payload.name : 'unknown'}`;
    case 'tool.result':
      return `tool result: ${typeof payload.error === 'string' ? `error: ${payload.error.slice(0, 100)}` : 'ok'}`;
    default:
      return `${event.type}`;
  }
}

export async function traceShow(runId: string, dir?: string): Promise<string> {
  if (runId.trim() === '') return 'Usage: forge trace show <run-id>';

  const events = await loadRun(dir ?? DEFAULT_TRACE_DIR, runId);
  if (events.length === 0) return `No trace found for run: ${runId}`;

  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const first = sorted[0]!;
  const agent = first.agent ?? 'unknown';
  const lines: string[] = [`Run ${runId} — agent: ${agent}, events: ${sorted.length}`, ''];

  for (const event of sorted) {
    const time = formatTime(event.timestamp);
    const summary = eventSummary(event);
    lines.push(`  [${time}] ${summary}`);
  }

  return lines.join('\n');
}

export async function traceList(dir?: string): Promise<string> {
  const runs = await listRunIds(dir);
  if (runs.length === 0) return 'No traces recorded yet.';

  const lines: string[] = [];
  for (const run of runs) {
    lines.push(formatRunSummary(run));
  }
  return lines.join('\n');
}

function formatRunSummary(run: RunSummary): string {
  const time = formatTime(run.startedAt);
  return `${time}  ${run.runId}  events: ${run.eventCount}  types: ${run.types.join(', ')}`;
}