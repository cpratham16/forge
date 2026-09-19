// Claude ModelProvider adapter contract tests.
// Runs the same contract test suite as the mock adapter.
import { describe } from 'vitest';
import { modelProviderContractTests } from './contract.test.js';
import type { ModelProvider } from '@runforge/contracts';
import { ClaudeModelProvider } from '../../src/model/claude.js';

describe('Claude ModelProvider', () => {
  // Only run if API key is available
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  const factory = (): ModelProvider => new ClaudeModelProvider({ apiKey });

  if (apiKey) {
    modelProviderContractTests('claude', factory);
  } else {
    it.skip('skipped: ANTHROPIC_API_KEY not set', () => {});
  }
});