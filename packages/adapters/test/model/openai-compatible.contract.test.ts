// OpenAI-Compatible ModelProvider adapter contract tests.
// Runs the same contract test suite as the mock and Claude adapters.
import { describe } from 'vitest';
import { modelProviderContractTests } from './contract.test.js';
import type { ModelProvider } from '@runforge/contracts';
import { OpenAICompatibleModelProvider } from '../../src/model/openai-compatible.js';

describe('OpenAI-Compatible ModelProvider', () => {
  const baseUrl = process.env['OPENAI_BASE_URL'];
  const apiKey = process.env['OPENAI_API_KEY'];
  const model = process.env['OPENAI_MODEL'] ?? 'deepseek-r1';

  const factory = (): ModelProvider => {
    if (!baseUrl) {
      throw new Error('OPENAI_BASE_URL not set');
    }
    return new OpenAICompatibleModelProvider({ baseUrl, apiKey, model });
  };

  if (baseUrl) {
    modelProviderContractTests('openai-compatible', factory);
  } else {
    it.skip('skipped: OPENAI_BASE_URL not set (set to test against Ollama/OpenRouter/Groq)', () => {});
  }
});