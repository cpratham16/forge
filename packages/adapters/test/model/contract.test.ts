// ModelProvider contract test suite.
// These tests define the behavioral contract that ANY ModelProvider adapter must satisfy.
// Run first against the mock adapter, then against the real Claude adapter.
import { describe, it, expect } from 'vitest';
import type { ModelProvider, ModelRequest } from '@forge/contracts';
import { MockModelProvider } from '../../src/model/mock.js';

/**
 * Shared contract tests that any ModelProvider must pass.
 * Call this function with a factory that creates the adapter under test.
 */
export function modelProviderContractTests(
  name: string,
  factory: () => ModelProvider,
): void {
  describe(`ModelProvider contract: ${name}`, () => {
    it('returns a valid ModelResponse for a simple text request', async () => {
      const provider = factory();
      const request: ModelRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const response = await provider.complete(request);

      // Structural validation
      expect(response).toHaveProperty('content');
      expect(response).toHaveProperty('model');
      expect(response).toHaveProperty('usage');
      expect(response).toHaveProperty('finishReason');

      expect(typeof response.content).toBe('string');
      expect(typeof response.model).toBe('string');
      expect(response.model.length).toBeGreaterThan(0);

      expect(typeof response.usage.inputTokens).toBe('number');
      expect(typeof response.usage.outputTokens).toBe('number');
      expect(response.usage.inputTokens).toBeGreaterThanOrEqual(0);
      expect(response.usage.outputTokens).toBeGreaterThanOrEqual(0);

      expect(['stop', 'tool_calls', 'length', 'error']).toContain(response.finishReason);
    });

    it('returns finishReason "stop" for a normal completion', async () => {
      const provider = factory();
      const request: ModelRequest = {
        messages: [{ role: 'user', content: 'Say hello in one word.' }],
      };

      const response = await provider.complete(request);
      expect(response.finishReason).toBe('stop');
      expect(response.content.length).toBeGreaterThan(0);
    });

    it('reports non-zero token usage', async () => {
      const provider = factory();
      const request: ModelRequest = {
        messages: [{ role: 'user', content: 'Test message' }],
      };

      const response = await provider.complete(request);
      // Both input and output tokens should be reported
      expect(response.usage.inputTokens).toBeGreaterThan(0);
      expect(response.usage.outputTokens).toBeGreaterThan(0);
    });

    it('handles multi-turn conversation', async () => {
      const provider = factory();
      const request: ModelRequest = {
        messages: [
          { role: 'user', content: 'My name is Alice.' },
          { role: 'assistant', content: 'Hello Alice!' },
          { role: 'user', content: 'What is my name?' },
        ],
      };

      const response = await provider.complete(request);
      expect(response).toHaveProperty('content');
      expect(typeof response.content).toBe('string');
    });

    it('returns tool_calls finishReason when tools are provided and model uses them', async () => {
      const provider = factory();
      const request: ModelRequest = {
        messages: [{ role: 'user', content: 'List files in the current directory' }],
        tools: [
          {
            name: 'list_files',
            description: 'List files in a directory',
            parameters: {
              directory: { type: 'string', description: 'The directory path' },
            },
          },
        ],
      };

      const response = await provider.complete(request);
      // The provider either returns tool_calls or stop — both are valid
      expect(['stop', 'tool_calls']).toContain(response.finishReason);

      if (response.finishReason === 'tool_calls') {
        expect(response.toolCalls).toBeDefined();
        expect(Array.isArray(response.toolCalls)).toBe(true);
        expect(response.toolCalls!.length).toBeGreaterThan(0);

        for (const call of response.toolCalls!) {
          expect(call).toHaveProperty('id');
          expect(call).toHaveProperty('name');
          expect(call).toHaveProperty('arguments');
          expect(typeof call.id).toBe('string');
          expect(typeof call.name).toBe('string');
        }
      }
    });

    it('returns a ModelResponse even with a system message', async () => {
      const provider = factory();
      const request: ModelRequest = {
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hi' },
        ],
      };

      const response = await provider.complete(request);
      expect(response).toHaveProperty('content');
      expect(response).toHaveProperty('model');
      expect(response).toHaveProperty('finishReason');
    });
  });
}

// Run contract tests against mock adapter
describe('Mock ModelProvider', () => {
  modelProviderContractTests('mock', () => new MockModelProvider());

  it('records calls for test inspection', async () => {
    const provider = new MockModelProvider();
    await provider.complete({ messages: [{ role: 'user', content: 'test' }] });
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]!.messages[0]!.content).toBe('test');
  });

  it('uses custom handler when provided', async () => {
    const provider = new MockModelProvider({
      handler: (_req) => ({
        content: 'custom response',
        model: 'custom-model',
        usage: { inputTokens: 1, outputTokens: 2 },
        finishReason: 'stop',
      }),
    });

    const response = await provider.complete({ messages: [{ role: 'user', content: 'test' }] });
    expect(response.content).toBe('custom response');
    expect(response.model).toBe('custom-model');
  });

  it('returns tool_calls when toolCalls option is set and tools are in request', async () => {
    const provider = new MockModelProvider({
      toolCalls: [{ id: 'tc1', name: 'list_files', arguments: { directory: '.' } }],
    });

    const response = await provider.complete({
      messages: [{ role: 'user', content: 'list files' }],
      tools: [{ name: 'list_files', description: 'List files', parameters: {} }],
    });

    expect(response.finishReason).toBe('tool_calls');
    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls![0]!.name).toBe('list_files');
  });
});
