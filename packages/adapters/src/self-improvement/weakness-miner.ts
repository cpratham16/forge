// Weakness Miner — analyzes failure traces to identify reusable failure mechanisms.
// Based on Self-Harness (Zhang et al.) + HALO + ACE patterns.
import { loadTraceEvents } from '../trace/jsonl.js';
import type { TraceEvent, VerificationResult } from '@forge/contracts';

export type FailureMechanism =
  | 'missing_final_artifact'
  | 'repeated_invalid_command'
  | 'no_recovery_after_tool_error'
  | 'exploration_without_implementation';

export interface WeaknessCluster {
  mechanism: FailureMechanism;
  count: number;
  exampleRuns: string[];
  suggestedFix: string;
  severity: 'low' | 'medium' | 'high';
  totalCost: number;
  totalLatencyMs: number;
}

export interface WeaknessReport {
  clusters: WeaknessCluster[];
  totalRunsAnalyzed: number;
  totalFailures: number;
  generatedAt: number;
}

interface RunSummary {
  runId: string;
  events: TraceEvent[];
  verification: VerificationResult | undefined;
  hasFailure: boolean;
  failureType?: FailureMechanism;
  toolCalls: Map<string, number>;
  toolErrors: Map<string, number>;
  readSearchCount: number;
  writeEditCount: number;
  totalCost: number;
  totalLatencyMs: number;
}

function analyzeRun(events: TraceEvent[]): RunSummary {
  const toolCalls = new Map<string, number>();
  const toolErrors = new Map<string, number>();
  let readSearchCount = 0;
  let writeEditCount = 0;
  let verification: VerificationResult | undefined;
  let totalCost = 0;
  let totalLatencyMs = 0;
  const runId = events[0]?.payload?.runId as string ?? 'unknown';

  for (const event of events) {
    if (event.type === 'tool.call') {
      const name = event.payload.name as string;
      toolCalls.set(name, (toolCalls.get(name) ?? 0) + 1);
      if (name === 'read_file' || name === 'search' || name === 'grep') {
        readSearchCount++;
      } else if (name === 'write_file' || name === 'edit_file' || name === 'delete_file') {
        writeEditCount++;
      }
    } else if (event.type === 'tool.result') {
      const error = event.payload.error as string | undefined;
      if (error) {
        const name = event.payload.name as string;
        toolErrors.set(name, (toolErrors.get(name) ?? 0) + 1);
      }
    } else if (event.type === 'verification.result') {
      verification = event.payload as unknown as VerificationResult;
    } else if (event.type === 'model.response') {
      const usage = event.payload.usage as { inputTokens?: number; outputTokens?: number } | undefined;
      if (usage) {
        totalCost += (usage.inputTokens ?? 0) * 0.0000015 + (usage.outputTokens ?? 0) * 0.000006;
      }
      const latency = event.payload.latencyMs as number | undefined;
      totalLatencyMs += latency ?? 0;
    }
  }

  let hasFailure = false;
  let failureType: FailureMechanism | undefined;

  if (verification) {
    if (verification.status === 'failed') {
      hasFailure = true;
      failureType = 'missing_final_artifact';
    } else if (verification.status === 'not_observed') {
      hasFailure = true;
      failureType = 'missing_final_artifact';
    }
  }

  if (!hasFailure) {
    for (const [tool, count] of toolErrors) {
      if (count >= 3 && (toolCalls.get(tool) ?? 0) >= 3) {
        hasFailure = true;
        failureType = 'repeated_invalid_command';
        break;
      }
    }
  }

  if (!hasFailure) {
    for (const [tool, errors] of toolErrors) {
      const calls = toolCalls.get(tool) ?? 0;
      if (errors > 0 && calls > 0) {
        const hasRecovery = Array.from(toolCalls.keys()).some((t) =>
          t !== tool && (t === 'write_file' || t === 'edit_file' || t === 'run_command')
        );
        if (!hasRecovery) {
          hasFailure = true;
          failureType = 'no_recovery_after_tool_error';
          break;
        }
      }
    }
  }

  if (!hasFailure && readSearchCount > 10 && writeEditCount === 0) {
    hasFailure = true;
    failureType = 'exploration_without_implementation';
  }

  return {
    runId,
    events,
    verification,
    hasFailure,
    ...(failureType !== undefined ? { failureType } : {}),
    toolCalls,
    toolErrors,
    readSearchCount,
    writeEditCount,
    totalCost,
    totalLatencyMs,
  };
}

function clusterFailures(runs: RunSummary[]): WeaknessCluster[] {
  const clusters = new Map<FailureMechanism, RunSummary[]>();

  for (const run of runs) {
    if (run.hasFailure && run.failureType) {
      const existing = clusters.get(run.failureType) ?? [];
      existing.push(run);
      clusters.set(run.failureType, existing);
    }
  }

  const suggestions: Record<FailureMechanism, string> = {
    missing_final_artifact: 'Strengthen verification gate; require evidence before allowing DONE; add mandatory post-task verification checks',
    repeated_invalid_command: 'Add retry-with-backoff and alternative-tool suggestion on repeated failures; implement circuit breaker for failing tools',
    no_recovery_after_tool_error: 'Add mandatory fallback strategy on tool errors; implement automatic alternative-tool selection',
    exploration_without_implementation: 'Add write/edit ratio threshold check; require implementation progress before allowing continued exploration',
  };

  const severityMap: Record<FailureMechanism, 'low' | 'medium' | 'high'> = {
    missing_final_artifact: 'high',
    repeated_invalid_command: 'high',
    no_recovery_after_tool_error: 'medium',
    exploration_without_implementation: 'low',
  };

  const result: WeaknessCluster[] = [];
  for (const [mechanism, runs] of clusters) {
    const exampleRuns = runs.slice(0, 3).map((r) => r.runId);
    const totalCost = runs.reduce((sum, r) => sum + r.totalCost, 0);
    const totalLatencyMs = runs.reduce((sum, r) => sum + r.totalLatencyMs, 0);

    result.push({
      mechanism,
      count: runs.length,
      exampleRuns,
      suggestedFix: suggestions[mechanism],
      severity: severityMap[mechanism],
      totalCost,
      totalLatencyMs,
    });
  }

  result.sort((a, b) => b.count - a.count);
  return result;
}

export async function mineWeaknesses(
  traceDir: string = '.forge/traces',
  _minRuns = 1
): Promise<WeaknessReport> {
  const allEvents = await loadTraceEvents(traceDir);
  if (allEvents.length === 0) {
    return {
      clusters: [],
      totalRunsAnalyzed: 0,
      totalFailures: 0,
      generatedAt: Date.now(),
    };
  }

  const byRun = new Map<string, TraceEvent[]>();
  for (const event of allEvents) {
    const runId = event.payload.runId as string ?? 'unknown';
    const bucket = byRun.get(runId) ?? [];
    bucket.push(event);
    byRun.set(runId, bucket);
  }

  const runs: RunSummary[] = [];
  for (const [, events] of byRun) {
    const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
    runs.push(analyzeRun(sorted));
  }

  const clusters = clusterFailures(runs);
  const totalFailures = runs.filter((r) => r.hasFailure).length;

  return {
    clusters,
    totalRunsAnalyzed: runs.length,
    totalFailures,
    generatedAt: Date.now(),
  };
}

export function formatWeaknessReport(report: WeaknessReport): string {
  const lines: string[] = [
    'Weakness Mining Report',
    '======================',
    `Generated: ${new Date(report.generatedAt).toISOString()}`,
    `Total runs analyzed: ${report.totalRunsAnalyzed}`,
    `Total failures detected: ${report.totalFailures}`,
    '',
    'Clusters (ranked by frequency):',
    '',
  ];

  if (report.clusters.length === 0) {
    lines.push('  No failure patterns detected.');
    return lines.join('\n');
  }

  for (let i = 0; i < report.clusters.length; i++) {
    const c = report.clusters[i];
    if (!c) continue;
    lines.push(
      `  ${i + 1}. ${c.mechanism.replace(/_/g, ' ')} (${c.count} occurrences, ${c.severity} severity)`,
      `     Cost: $${c.totalCost.toFixed(4)} | Latency: ${(c.totalLatencyMs / 1000).toFixed(1)}s`,
      `     Examples: ${c.exampleRuns.join(', ')}`,
      `     Suggested fix: ${c.suggestedFix}`,
      '',
    );
  }

  return lines.join('\n');
}