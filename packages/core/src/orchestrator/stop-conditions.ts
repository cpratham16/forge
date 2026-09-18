// StopCondition evaluation (A6). The orchestrator checks these before every
// retry attempt and terminates immediately once a threshold is reached.
import type { StopCondition } from '@forge/contracts';

export interface StopRunState {
  attempts: number;
  consecutiveFailures: number;
  elapsedMs: number;
  totalTokens: number;
}

export interface TrippedStopCondition {
  type: StopCondition['type'];
  threshold: number | string;
  description?: string;
  value: number | string;
}

/**
 * Returns the first tripped condition, or undefined if none has been reached.
 * `cost_limit` uses total tokens as the cost proxy (no real currency model in
 * the pure loop); `custom` conditions need a runtime predicate that the pure
 * data contract cannot express, so they never trip here.
 */
export function checkStopConditions(
  conditions: StopCondition[],
  state: StopRunState,
): TrippedStopCondition | undefined {
  for (const condition of conditions) {
    switch (condition.type) {
      case 'max_retries': {
        if (typeof condition.threshold === 'number' && state.attempts >= condition.threshold) {
          return tripped(condition, state.attempts);
        }
        break;
      }
      case 'consecutive_failures': {
        if (typeof condition.threshold === 'number' && state.consecutiveFailures >= condition.threshold) {
          return tripped(condition, state.consecutiveFailures);
        }
        break;
      }
      case 'time_limit': {
        if (typeof condition.threshold === 'number' && state.elapsedMs >= condition.threshold * 1000) {
          return tripped(condition, Math.round(state.elapsedMs / 1000));
        }
        break;
      }
      case 'cost_limit': {
        if (typeof condition.threshold === 'number' && state.totalTokens >= condition.threshold) {
          return tripped(condition, state.totalTokens);
        }
        break;
      }
      case 'custom':
        break;
    }
  }
  return undefined;
}

function tripped(condition: StopCondition, value: number | string): TrippedStopCondition {
  const description = condition.description;
  const base: TrippedStopCondition = { type: condition.type, threshold: condition.threshold, value };
  return description !== undefined ? { ...base, description } : base;
}