// @forge/adapters package-level tests
// Detailed contract tests are in test/model/contract.test.ts
import { describe, it, expect } from 'vitest';
import { MockModelProvider, ClaudeModelProvider } from '../src/index.js';

describe('@forge/adapters exports', () => {
  it('exports MockModelProvider', () => {
    expect(MockModelProvider).toBeDefined();
    expect(typeof MockModelProvider).toBe('function');
  });

  it('exports ClaudeModelProvider', () => {
    expect(ClaudeModelProvider).toBeDefined();
    expect(typeof ClaudeModelProvider).toBe('function');
  });

  it('MockModelProvider implements ModelProvider', async () => {
    const provider = new MockModelProvider();
    expect(typeof provider.complete).toBe('function');
  });
});
