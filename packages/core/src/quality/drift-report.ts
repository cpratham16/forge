import type { DriftItem, DriftReport, Task, TraceEvent } from '@forge/contracts';

export interface DriftProjectionOptions {
  expectedAgentOrder?: string[];
}

export function projectDriftReport(
  task: Task,
  traceEvents: TraceEvent[],
  options: DriftProjectionOptions = {},
): DriftReport {
  const items: DriftItem[] = [];
  let projectedCount = 0;

  const modelRequests = traceEvents.filter((e) => e.type === 'model.request');
  const toolCalls = traceEvents.filter((e) => e.type === 'tool.call');
  const toolResults = traceEvents.filter((e) => e.type === 'tool.result');
  const stateTransitions = traceEvents.filter((e) => e.type === 'state.transition');
  const agentMessages = traceEvents.filter((e) => e.type === 'agent.message');
  const verificationResults = traceEvents.filter((e) => e.type === 'verification.result');

  projectedCount =
    modelRequests.length +
    toolCalls.length +
    toolResults.length +
    stateTransitions.length +
    agentMessages.length +
    verificationResults.length;

  if (task.scope?.in) {
    const plannedFiles = new Set(task.scope.in);
    const touchedFiles = new Set<string>();

    for (const call of toolCalls) {
      const target = call.payload.target as string | undefined;
      if (target) touchedFiles.add(target);
    }

    for (const file of touchedFiles) {
      if (!plannedFiles.has(file)) {
        items.push({
          type: 'unexpected_file_modification',
          description: `Modified file '${file}' not in task scope`,
          detectedAt: Date.now(),
          severity: 'medium',
          details: { file, plannedFiles: Array.from(plannedFiles) },
        });
      }
    }

    for (const file of plannedFiles) {
      if (!touchedFiles.has(file)) {
        items.push({
          type: 'omitted_task',
          description: `Planned file '${file}' was not touched`,
          detectedAt: Date.now(),
          severity: 'low',
          details: { file },
        });
      }
    }
  }

  const agentSequence = agentMessages.map((e) => e.agent as string);
  const expectedOrder = options.expectedAgentOrder ?? ['developer', 'reviewer'];
  if (agentSequence.length > 1) {
    for (let i = 1; i < agentSequence.length; i++) {
      const fromAgent = agentSequence[i - 1];
      const toAgent = agentSequence[i];
      if (fromAgent && toAgent && fromAgent !== toAgent) {
        const fromIdx = expectedOrder.indexOf(fromAgent);
        const toIdx = expectedOrder.indexOf(toAgent);
        if (fromIdx !== -1 && toIdx !== -1 && toIdx < fromIdx) {
          items.push({
            type: 'out_of_sequence',
            description: `Agent handoff out of expected order: ${fromAgent} -> ${toAgent}`,
            detectedAt: Date.now(),
            severity: 'medium',
            details: { from: fromAgent, to: toAgent },
          });
        }
      }
    }
  }

  const unplannedTasks = traceEvents.filter(
    (e) => e.type === 'orchestration.decision' && (e.payload as { unplanned?: boolean }).unplanned,
  );
  for (const event of unplannedTasks) {
    items.push({
      type: 'unplanned_task',
      description: `Unplanned task detected: ${(event.payload as { description?: string }).description ?? 'unknown'}`,
      detectedAt: event.timestamp,
      severity: 'high',
      details: event.payload,
    });
  }

  const scopeChanges = traceEvents.filter(
    (e) => e.type === 'orchestration.decision' && (e.payload as { scopeChange?: boolean }).scopeChange,
  );
  for (const event of scopeChanges) {
    items.push({
      type: 'scope_creep',
      description: `Scope change detected: ${(event.payload as { description?: string }).description ?? 'unknown'}`,
      detectedAt: event.timestamp,
      severity: 'high',
      details: event.payload,
    });
  }

  const driftScore = items.length > 0
    ? Math.min(
        1,
        items.reduce((sum, i) => sum + (i.severity === 'high' ? 0.3 : i.severity === 'medium' ? 0.15 : 0.05), 0),
      )
    : 0;

  return {
    taskId: task.id,
    driftScore,
    items,
    projectedFromTraceEvents: projectedCount,
    timestamp: Date.now(),
  };
}