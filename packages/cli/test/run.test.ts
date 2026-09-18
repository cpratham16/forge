// Integration test: forge run with mock provider produces valid response.
import { describe, it, expect } from 'vitest';
import { forgeRun } from '../src/index.js';

describe('forge run integration', () => {
  it('produces a valid response using mock provider', async () => {
    const result = await forgeRun({
      task: 'list the files in src/',
      mock: true,
    });

    // Structural validation of the result
    expect(result).toHaveProperty('content');
    expect(result).toHaveProperty('model');
    expect(result).toHaveProperty('usage');
    expect(result).toHaveProperty('turns');
    expect(result).toHaveProperty('completed');

    expect(typeof result.content).toBe('string');
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.content).toContain('list the files in src/');

    expect(typeof result.model).toBe('string');
    expect(result.model.length).toBeGreaterThan(0);

    expect(result.usage.inputTokens).toBeGreaterThan(0);
    expect(result.usage.outputTokens).toBeGreaterThan(0);

    expect(result.turns).toBeGreaterThanOrEqual(1);
    expect(result.completed).toBe(true);
  });

  it('passes custom model parameter', async () => {
    const result = await forgeRun({
      task: 'say hello',
      mock: true,
      model: 'custom-model',
    });

    expect(result.completed).toBe(true);
    expect(result.content.length).toBeGreaterThan(0);
  });

  it('respects maxTurns', async () => {
    const result = await forgeRun({
      task: 'test',
      mock: true,
      maxTurns: 1,
    });

    expect(result.turns).toBeLessThanOrEqual(1);
  });

  it('uses custom system prompt', async () => {
    const result = await forgeRun({
      task: 'test with custom prompt',
      mock: true,
      systemPrompt: 'You are a security analyst.',
    });

    expect(result.completed).toBe(true);
  });
});
