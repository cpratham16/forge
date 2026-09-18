import type {
  AgentMessage,
  DriftReport,
  OQSScore,
  ReviewResult,
  Task,
  TraceEvent,
} from '@forge/contracts';
import { projectDriftReport } from './drift-report.js';

export type { OQSScore } from '@forge/contracts';

export interface OQSInput {
  task: Task;
  traceEvents: TraceEvent[];
  agentMessages: AgentMessage[];
  reviewResult?: ReviewResult;
  developerOutput?: string;
  plannedSteps?: string[];
  actualSteps?: string[];
}

export type OQSWeights = Record<keyof Omit<OQSScore, 'composite' | 'details'>, number>;

export const DEFAULT_OQS_WEIGHTS: OQSWeights = {
  planQuality: 0.25,
  assignmentQuality: 0.2,
  coordination: 0.2,
  deliverableQuality: 0.2,
  efficiency: 0.15,
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function scorePlanQuality(input: OQSInput): number {
  const { task, plannedSteps, actualSteps } = input;
  if (!plannedSteps || plannedSteps.length === 0) {
    return 0.3;
  }
  if (!actualSteps || actualSteps.length === 0) {
    return 0.4;
  }

  const coverage = plannedSteps.filter((p) => actualSteps.some((a) => a.includes(p) || p.includes(a))).length / plannedSteps.length;
  const precision = actualSteps.filter((a) => plannedSteps.some((p) => p.includes(a) || a.includes(p))).length / actualSteps.length;

  const complexityFactor = task.estimatedComplexity === 'HIGH' ? 1.0 : task.estimatedComplexity === 'MEDIUM' ? 0.8 : 0.6;
  return clamp01((coverage * 0.6 + precision * 0.4) * complexityFactor);
}

function scoreAssignmentQuality(input: OQSInput): number {
  const { agentMessages, task } = input;
  if (agentMessages.length === 0) {
    return 0.5;
  }

  const handoffs = agentMessages.filter((m) => m.type === 'task' || m.type === 'review').length;
  const questions = agentMessages.filter((m) => m.type === 'question').length;
  const findings = agentMessages.filter((m) => m.type === 'finding').length;

  const expectedAgents = task.scope?.in?.length ?? 2;
  const handoffRatio = handoffs / Math.max(1, expectedAgents);
  const questionRatio = questions / Math.max(1, handoffs);
  const findingRatio = findings / Math.max(1, handoffs);

  return clamp01(0.4 * Math.min(1, handoffRatio) + 0.3 * Math.min(1, questionRatio * 2) + 0.3 * Math.min(1, findingRatio * 0.5));
}

function scoreCoordination(input: OQSInput, driftReport: DriftReport): number {
  const { traceEvents, agentMessages } = input;
  let score = 0.5;

  const stateTransitions = traceEvents.filter((e) => e.type === 'state.transition').length;
  const agentMessagesCount = agentMessages.length;
  const toolCalls = traceEvents.filter((e) => e.type === 'tool.call').length;

  if (stateTransitions > 0 && agentMessagesCount > 0) {
    score += 0.2 * Math.min(1, stateTransitions / Math.max(1, agentMessagesCount));
  }

  if (toolCalls > 0 && agentMessagesCount > 0) {
    score += 0.15 * Math.min(1, toolCalls / Math.max(1, agentMessagesCount * 2));
  }

  if (driftReport) {
    score = Math.max(0, score - driftReport.driftScore * 0.5);
  }

  return clamp01(score);
}

function scoreDeliverableQuality(input: OQSInput): number {
  const { reviewResult, developerOutput, task } = input;
  if (!reviewResult) {
    return 0.4;
  }

  let score = reviewResult.approved ? 0.7 : 0.2;

  const blockingCount = reviewResult.blockingFindings.length;
  const nonBlockingCount = reviewResult.nonBlockingFindings.length;

  score -= blockingCount * 0.15;
  score -= nonBlockingCount * 0.05;

  if (developerOutput && task.successCriteria) {
    const met = task.successCriteria.filter((c) => developerOutput.includes(c.description)).length;
    score += (met / Math.max(1, task.successCriteria.length)) * 0.3;
  }

  return clamp01(score);
}

function scoreEfficiency(input: OQSInput): number {
  const { traceEvents, task } = input;
  const turns = traceEvents.filter((e) => e.type === 'model.request').length;
  const toolCalls = traceEvents.filter((e) => e.type === 'tool.call').length;
  const errors = traceEvents.filter((e) => e.type === 'tool.result' && (e.payload as { error?: string }).error).length;

  const expectedTurns = task.estimatedComplexity === 'HIGH' ? 8 : task.estimatedComplexity === 'MEDIUM' ? 5 : 3;
  const turnEfficiency = Math.max(0, 1 - Math.max(0, turns - expectedTurns) / expectedTurns);

  const errorRate = toolCalls > 0 ? errors / toolCalls : 0;
  const errorPenalty = errorRate * 0.5;

  return clamp01(turnEfficiency * 0.7 + (1 - errorPenalty) * 0.3);
}

export function calculateOQS(input: OQSInput, weights: OQSWeights = DEFAULT_OQS_WEIGHTS): OQSScore {
  const driftReport = projectDriftReport(input.task, input.traceEvents);

  const planQuality = scorePlanQuality(input);
  const assignmentQuality = scoreAssignmentQuality(input);
  const coordination = scoreCoordination(input, driftReport);
  const deliverableQuality = scoreDeliverableQuality(input);
  const efficiency = scoreEfficiency(input);

  const composite =
    planQuality * weights.planQuality +
    assignmentQuality * weights.assignmentQuality +
    coordination * weights.coordination +
    deliverableQuality * weights.deliverableQuality +
    efficiency * weights.efficiency;

  return {
    planQuality,
    assignmentQuality,
    coordination,
    deliverableQuality,
    efficiency,
    composite: clamp01(composite),
    details: {
      driftReport,
      dimensionWeights: weights,
    },
  };
}

export interface OQSDimensionScore {
  name: string;
  score: number;
  weight: number;
  contributingFactors: string[];
}