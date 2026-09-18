import type {
  AgentMessage,
  ModelProvider,
  ModelRequest,
  ReviewFinding,
  ReviewResult,
  StopCondition,
} from '@forge/contracts';
import { runSingleAgentLoop, type OrchestratorConfig, type OrchestratorResult } from './single-agent-loop.js';
import { checkStopConditions, type StopRunState } from './stop-conditions.js';

export interface TwoAgentConfig {
  developer: OrchestratorConfig;
  reviewer: OrchestratorConfig & {
    modelProvider: ModelProvider;
    systemPrompt?: string;
    maxTurns?: number;
  };
  stopConditions?: StopCondition[];
  taskId?: string;
}

export interface TwoAgentResult {
  developerResult: OrchestratorResult;
  reviewerResult: OrchestratorResult;
  reviewResult: ReviewResult;
  messages: AgentMessage[];
  completed: boolean;
  stopReason?: string;
}

function reviewFindingToMessage(finding: ReviewFinding, reviewer: string): AgentMessage {
  return {
    from: reviewer,
    to: 'developer',
    type: 'finding',
    payload: finding,
    evidence: [],
  };
}

function createReviewPrompt(task: string, developerOutput: string, findings: ReviewFinding[]): string {
  const blocking = findings.filter((f) => ['critical', 'major'].includes(f.severity));
  const nonBlocking = findings.filter((f) => ['minor', 'info'].includes(f.severity));

  return (
    `You are reviewing the work of another agent.\n` +
    `Original task: ${task}\n\n` +
    `Developer's output:\n${developerOutput}\n\n` +
    `Previous findings:\n` +
    (blocking.length > 0
      ? `BLOCKING:\n${blocking.map((f) => `- [${f.severity}] ${f.description}`).join('\n')}\n`
      : 'No blocking findings.\n') +
    (nonBlocking.length > 0
      ? `NON-BLOCKING:\n${nonBlocking.map((f) => `- [${f.severity}] ${f.description}`).join('\n')}`
      : 'No non-blocking findings.\n') +
    `\nProduce a ReviewResult as JSON with: reviewer, approved (boolean), blockingFindings[], nonBlockingFindings[], summary.`
  );
}

async function runReviewerAgent(
  task: string,
  developerOutput: string,
  config: TwoAgentConfig['reviewer'],
  existingFindings: ReviewFinding[],
): Promise<{ result: OrchestratorResult; reviewResult: ReviewResult }> {
  const messages = [
    { role: 'system' as const, content: config.systemPrompt ?? 'You are a code reviewer. Output ReviewResult JSON only.' },
    { role: 'user' as const, content: createReviewPrompt(task, developerOutput, existingFindings) },
  ];

  const request: ModelRequest = {
    messages,
    temperature: config.temperature ?? 0.1,
    maxTokens: config.maxTokens ?? 2048,
  };

  const response = await config.modelProvider.complete(request);

  let reviewResult: ReviewResult;
  try {
    reviewResult = JSON.parse(response.content);
    if (!reviewResult.reviewer || typeof reviewResult.approved !== 'boolean') {
      throw new Error('Invalid ReviewResult structure');
    }
  } catch {
    reviewResult = {
      reviewer: 'reviewer',
      approved: false,
      blockingFindings: [
        {
          id: 'review-parse-error',
          severity: 'critical',
          category: 'format',
          description: 'Reviewer failed to produce valid ReviewResult JSON',
        },
      ],
      nonBlockingFindings: [],
      summary: 'Review parsing failed',
      timestamp: Date.now(),
    };
  }

  return {
    result: {
      content: response.content,
      responses: [response],
      totalUsage: response.usage,
      turns: 1,
      completed: true,
    },
    reviewResult,
  };
}

export async function runTwoAgentLoop(
  task: string,
  config: TwoAgentConfig,
): Promise<TwoAgentResult> {
  const startTime = Date.now();
  const messages: AgentMessage[] = [];
  let consecutiveFailures = 0;
  let attempts = 0;
  let stopReason: string | undefined;
  let reviewResult: ReviewResult | undefined;
  let developerResult: OrchestratorResult | undefined;
  let reviewerResult: OrchestratorResult | undefined;

  for (;;) {
    const state: StopRunState = {
      attempts,
      consecutiveFailures,
      elapsedMs: Date.now() - startTime,
      totalTokens: (developerResult?.totalUsage.inputTokens ?? 0) + (developerResult?.totalUsage.outputTokens ?? 0),
    };

    const stopped = config.stopConditions !== undefined && config.stopConditions.length > 0
      ? checkStopConditions(config.stopConditions, state)
      : undefined;
    if (stopped) {
      stopReason = `stop-condition:${stopped.type} (threshold ${stopped.threshold}, reached ${stopped.value})`;
      break;
    }

    if (attempts >= (config.developer.maxTurns ?? 10)) {
      stopReason = 'max-turns';
      break;
    }

    const devResult = await runSingleAgentLoop(task, config.developer);
    developerResult = devResult;
    attempts++;

    if (!devResult.completed) {
      consecutiveFailures++;
      continue;
    }

    const review = await runReviewerAgent(task, devResult.content, config.reviewer, reviewResult?.blockingFindings ?? []);
    reviewerResult = review.result;
    reviewResult = review.reviewResult;
    attempts++;

    const currentReview = reviewResult;
    if (!currentReview) {
      consecutiveFailures++;
      continue;
    }

    messages.push(
      ...currentReview.blockingFindings.map((f) => reviewFindingToMessage(f, currentReview.reviewer)),
      ...currentReview.nonBlockingFindings.map((f) => reviewFindingToMessage(f, currentReview.reviewer)),
    );

    if (currentReview.approved) {
      return {
        developerResult,
        reviewerResult,
        reviewResult: currentReview,
        messages,
        completed: true,
      };
    }

    if (currentReview.blockingFindings.length > 0) {
      const feedback = currentReview.blockingFindings
        .map((f) => `- [${f.severity}] ${f.description}${f.suggestion ? ` (suggestion: ${f.suggestion})` : ''}`)
        .join('\n');
      task = `${task}\n\nReviewer feedback (blocking):\n${feedback}\n\nFix the issues and try again.`;
      consecutiveFailures++;
      continue;
    }

    if (currentReview.nonBlockingFindings.length > 0) {
      return {
        developerResult,
        reviewerResult,
        reviewResult: currentReview,
        messages,
        completed: true,
      };
    }

    consecutiveFailures++;
  }

  return {
    developerResult: developerResult ?? { content: '', responses: [], totalUsage: { inputTokens: 0, outputTokens: 0 }, turns: 0, completed: false },
    reviewerResult: reviewerResult ?? { content: '', responses: [], totalUsage: { inputTokens: 0, outputTokens: 0 }, turns: 0, completed: false },
    reviewResult: reviewResult ?? {
      reviewer: 'reviewer',
      approved: false,
      blockingFindings: [],
      nonBlockingFindings: [],
      summary: 'No review performed',
      timestamp: Date.now(),
    },
    messages,
    completed: false,
    stopReason,
  };
}