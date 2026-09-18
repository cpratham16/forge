// Single-agent orchestrator tests
import { describe, it, expect } from 'vitest';
import { runSingleAgentLoop } from '../src/orchestrator/single-agent-loop.js';
import type { ModelProvider, ModelRequest, ModelResponse } from '@forge/contracts';

// Simple mock provider for orchestrator testing
class TestModelProvider implements ModelProvider {
  private response: ModelResponse;

  constructor(response: ModelResponse) {
    this.response = response;
  }

  async complete(_input: ModelRequest): Promise<ModelResponse> {
    return { ...this.response };
  }
}

describe('single-agent orchestrator', () => {
  it('completes a simple task in one turn', async () => {
    const provider = new TestModelProvider({
      content: 'Hello world!',
      model: 'test-model',
      usage: { inputTokens: 10, outputTokens: 5 },
      finishReason: 'stop',
    });

    const result = await runSingleAgentLoop('Say hello', {
      modelProvider: provider,
      systemPrompt: 'Be brief.',
    });

    expect(result.content).toBe('Hello world!');
    expect(result.turns).toBe(1);
    expect(result.completed).toBe(true);
    expect(result.totalUsage.inputTokens).toBe(10);
    expect(result.totalUsage.outputTokens).toBe(5);
  });

  it('stops after maxTurns when model keeps responding normally', async () => {
    const provider: ModelProvider = {
      async complete(_input: ModelRequest): Promise<ModelResponse> {
        return {
          content: 'Response',
          model: 'test-model',
          usage: { inputTokens: 10, outputTokens: 5 },
          finishReason: 'stop',
        };
      },
    };

    const result = await runSingleAgentLoop('Long task', {
      modelProvider: provider,
      maxTurns: 3,
    });

    // First response has finishReason 'stop', so loop completes
    expect(result.turns).toBe(1);
    expect(result.completed).toBe(true);
  });

  it('respects maxTurns when model would continue', async () => {
    const provider: ModelProvider = {
      async complete(_input: ModelRequest): Promise<ModelResponse> {
        return {
          content: 'Response',
          model: 'test-model',
          usage: { inputTokens: 10, outputTokens: 5 },
          finishReason: 'length',
        };
      },
    };

    const result = await runSingleAgentLoop('Task', {
      modelProvider: provider,
      maxTurns: 10,
    });

    // Stops on first turn due to 'length'
    expect(result.turns).toBe(1);
    expect(result.completed).toBe(true);
  });

  it('stops on tool_calls finishReason', async () => {
    const provider = new TestModelProvider({
      content: '',
      model: 'test-model',
      usage: { inputTokens: 10, outputTokens: 5 },
      finishReason: 'tool_calls',
      toolCalls: [{ id: 'tc1', name: 'list_files', arguments: { path: '.' } }],
    });

    const result = await runSingleAgentLoop('List files', {
      modelProvider: provider,
    });

    expect(result.content).toBe('');
    expect(result.turns).toBe(1);
    expect(result.completed).toBe(true);
  });

  it('includes system prompt in messages sent to model', async () => {
    const receivedMessages: ModelRequest[] = [];
    const provider: ModelProvider = {
      async complete(input: ModelRequest): Promise<ModelResponse> {
        receivedMessages.push(input);
        return {
          content: 'OK',
          model: 'test-model',
          usage: { inputTokens: 10, outputTokens: 5 },
          finishReason: 'stop',
        };
      },
    };

    await runSingleAgentLoop('Test task', {
      modelProvider: provider,
      systemPrompt: 'System instruction',
    });

    expect(receivedMessages[0]!.messages).toHaveLength(2);
    expect(receivedMessages[0]!.messages[0]).toEqual({ role: 'system', content: 'System instruction' });
    expect(receivedMessages[0]!.messages[1]).toEqual({ role: 'user', content: 'Test task' });
  });

  it('passes tools to model when configured', async () => {
    const receivedRequests: ModelRequest[] = [];
    const provider: ModelProvider = {
      async complete(input: ModelRequest): Promise<ModelResponse> {
        receivedRequests.push(input);
        return {
          content: '',
          model: 'test-model',
          usage: { inputTokens: 10, outputTokens: 5 },
          finishReason: 'tool_calls',
          toolCalls: [{ id: 'tc1', name: 'my_tool', arguments: {} }],
        };
      },
    };

    await runSingleAgentLoop('Use tool', {
      modelProvider: provider,
      tools: [{ name: 'my_tool', description: 'A test tool', parameters: {} }],
    });

    expect(receivedRequests[0]!.tools).toBeDefined();
    expect(receivedRequests[0]!.tools).toHaveLength(1);
    expect(receivedRequests[0]!.tools![0]!.name).toBe('my_tool');
  });
});
