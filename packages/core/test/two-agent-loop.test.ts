import { describe, it, expect } from 'vitest';
import { runTwoAgentLoop } from '../src/orchestrator/two-agent-loop.js';
import type { ModelProvider, ModelResponse, OrchestratorConfig } from '@runforge/contracts';

function createMockModelProvider(responses: ModelResponse[]): ModelProvider {
  let callIndex = 0;
  return {
    async complete(_request: ModelResponse): Promise<ModelResponse> {
      return responses[callIndex++ % responses.length];
    },
  };
}

const developerConfig: OrchestratorConfig = {
  modelProvider: createMockModelProvider([
    { content: 'Implementation complete', toolCalls: undefined, model: 'test', usage: { inputTokens: 100, outputTokens: 50 }, finishReason: 'stop' },
  ]),
  maxTurns: 5,
};

const reviewerConfig: OrchestratorConfig & { modelProvider: ModelProvider; maxTurns?: number } = {
  modelProvider: createMockModelProvider([
    {
      content: JSON.stringify({
        reviewer: 'reviewer',
        approved: true,
        blockingFindings: [],
        nonBlockingFindings: [],
        summary: 'Code looks good',
        timestamp: Date.now(),
      }),
      toolCalls: undefined,
      model: 'test',
      usage: { inputTokens: 100, outputTokens: 50 },
      finishReason: 'stop',
    },
  ]),
  maxTurns: 2,
};

describe('runTwoAgentLoop', () => {
  it('completes successfully when reviewer approves', async () => {
    const result = await runTwoAgentLoop('Write a hello world function', {
      developer: developerConfig,
      reviewer: reviewerConfig,
    });

    expect(result.completed).toBe(true);
    expect(result.reviewResult.approved).toBe(true);
    expect(result.developerResult.completed).toBe(true);
    expect(result.reviewerResult.completed).toBe(true);
    expect(result.messages.length).toBe(0);
  });

  it('produces blocking findings that prevent completion', async () => {
    let reviewCallCount = 0;
    const blockingReviewerConfig = {
      ...reviewerConfig,
      modelProvider: {
        async complete(): Promise<ModelResponse> {
          reviewCallCount++;
          if (reviewCallCount === 1) {
            return {
              content: JSON.stringify({
                reviewer: 'reviewer',
                approved: false,
                blockingFindings: [
                  { id: 'f1', severity: 'critical', category: 'security', description: 'SQL injection vulnerability', filePath: 'src/auth.ts', lineNumber: 10 },
                ],
                nonBlockingFindings: [],
                summary: 'Critical security issue found',
                timestamp: Date.now(),
              }),
              toolCalls: undefined,
              model: 'test',
              usage: { inputTokens: 100, outputTokens: 50 },
              finishReason: 'stop',
            };
          }
          return {
            content: JSON.stringify({
              reviewer: 'reviewer',
              approved: true,
              blockingFindings: [],
              nonBlockingFindings: [],
              summary: 'Fixed',
              timestamp: Date.now(),
            }),
            toolCalls: undefined,
            model: 'test',
            usage: { inputTokens: 100, outputTokens: 50 },
            finishReason: 'stop',
          };
        },
      },
    };

    const result = await runTwoAgentLoop('Write auth code', {
      developer: developerConfig,
      reviewer: blockingReviewerConfig,
      stopConditions: [],
    });

    expect(result.completed).toBe(true);
    expect(result.reviewResult.approved).toBe(true);
    expect(result.reviewResult.blockingFindings.length).toBe(0);
    expect(result.messages.length).toBe(1);
    expect(result.messages[0].type).toBe('finding');
    expect(result.messages[0].payload).toEqual({
      id: 'f1',
      severity: 'critical',
      category: 'security',
      description: 'SQL injection vulnerability',
      filePath: 'src/auth.ts',
      lineNumber: 10,
    });
  });

  it('allows completion with non-blocking findings only', async () => {
    const nonBlockingReviewerConfig = {
      ...reviewerConfig,
      modelProvider: createMockModelProvider([
        {
          content: JSON.stringify({
            reviewer: 'reviewer',
            approved: false,
            blockingFindings: [],
            nonBlockingFindings: [
              { id: 'f1', severity: 'minor', category: 'style', description: 'Missing semicolon', filePath: 'src/main.ts', lineNumber: 5 },
            ],
            summary: 'Minor style issues',
            timestamp: Date.now(),
          }),
          toolCalls: undefined,
          model: 'test',
          usage: { inputTokens: 100, outputTokens: 50 },
          finishReason: 'stop',
        },
      ]),
    };

    const result = await runTwoAgentLoop('Write code', {
      developer: developerConfig,
      reviewer: nonBlockingReviewerConfig,
    });

    expect(result.completed).toBe(true);
    expect(result.reviewResult.approved).toBe(false);
    expect(result.reviewResult.blockingFindings.length).toBe(0);
    expect(result.reviewResult.nonBlockingFindings.length).toBe(1);
  });

  it('continues loop with updated task when blocking findings exist', async () => {
    let devCallCount = 0;
    const iterativeDevConfig: OrchestratorConfig = {
      modelProvider: {
        async complete(): Promise<ModelResponse> {
          devCallCount++;
          if (devCallCount === 1) {
            return { content: 'First attempt with bug', toolCalls: undefined, model: 'test', usage: { inputTokens: 100, outputTokens: 50 }, finishReason: 'stop' };
          }
          return { content: 'Fixed the bug', toolCalls: undefined, model: 'test', usage: { inputTokens: 100, outputTokens: 50 }, finishReason: 'stop' };
        },
      },
      maxTurns: 5,
    };

    let reviewCallCount = 0;
    const iterativeReviewerConfig = {
      ...reviewerConfig,
      modelProvider: {
        async complete(): Promise<ModelResponse> {
          reviewCallCount++;
          if (reviewCallCount === 1) {
            return {
              content: JSON.stringify({
                reviewer: 'reviewer',
                approved: false,
                blockingFindings: [{ id: 'f1', severity: 'major', category: 'logic', description: 'Off by one error' }],
                nonBlockingFindings: [],
                summary: 'Bug found',
                timestamp: Date.now(),
              }),
              toolCalls: undefined,
              model: 'test',
              usage: { inputTokens: 100, outputTokens: 50 },
              finishReason: 'stop',
            };
          }
          return {
            content: JSON.stringify({
              reviewer: 'reviewer',
              approved: true,
              blockingFindings: [],
              nonBlockingFindings: [],
              summary: 'Fixed',
              timestamp: Date.now(),
            }),
            toolCalls: undefined,
            model: 'test',
            usage: { inputTokens: 100, outputTokens: 50 },
            finishReason: 'stop',
          };
        },
      },
    };

    const result = await runTwoAgentLoop('Write loop code', {
      developer: iterativeDevConfig,
      reviewer: iterativeReviewerConfig,
      stopConditions: [],
    });

    expect(devCallCount).toBe(2);
    expect(reviewCallCount).toBe(2);
    expect(result.completed).toBe(true);
    expect(result.reviewResult.approved).toBe(true);
  });

  it('stops when stop condition is reached', async () => {
    const result = await runTwoAgentLoop('Write code', {
      developer: developerConfig,
      reviewer: reviewerConfig,
      stopConditions: [{ type: 'max_retries', threshold: 0, description: 'No retries' }],
    });

    expect(result.stopReason).toContain('stop-condition:max_retries');
    expect(result.completed).toBe(false);
  });
});