// Model Capabilities Registry — provider-specific model metadata for routing.
// This file lives in adapters because it contains vendor-specific knowledge.
// Core packages must not know about specific providers.
import type { ModelCapability } from '@runforge/contracts';

/**
 * Known model capabilities registry
 * Add new models here as they become available.
 */
export const MODEL_CAPABILITIES = [
  // Local models (free, low latency, limited context)
  { name: 'llama3.1:8b', costTier: 'free', latencyMs: 100, contextWindow: 8192, strengths: ['general', 'coding', 'reasoning'], provider: 'ollama', modelName: 'llama3.1:8b' },
  { name: 'qwen2.5:7b', costTier: 'free', latencyMs: 80, contextWindow: 32768, strengths: ['coding', 'multilingual'], provider: 'ollama', modelName: 'qwen2.5:7b' },
  { name: 'deepseek-r1:7b', costTier: 'free', latencyMs: 200, contextWindow: 16384, strengths: ['reasoning', 'math', 'coding'], provider: 'ollama', modelName: 'deepseek-r1:7b' },
  { name: 'mistral:7b', costTier: 'free', latencyMs: 80, contextWindow: 8192, strengths: ['general', 'fast'], provider: 'ollama', modelName: 'mistral:7b' },
  { name: 'phi3:mini', costTier: 'free', latencyMs: 50, contextWindow: 4096, strengths: ['fast', 'lightweight'], provider: 'ollama', modelName: 'phi3:mini' },
  
  // Cloud models (cost varies)
  { name: 'gpt-4o-mini', costTier: 'low', latencyMs: 500, contextWindow: 128000, strengths: ['general', 'coding', 'reasoning'], provider: 'openai', modelName: 'gpt-4o-mini' },
  { name: 'gpt-4o', costTier: 'high', latencyMs: 1000, contextWindow: 128000, strengths: ['reasoning', 'complex-coding', 'analysis'], provider: 'openai', modelName: 'gpt-4o' },
  { name: 'claude-3-haiku', costTier: 'low', latencyMs: 800, contextWindow: 200000, strengths: ['fast', 'coding', 'analysis'], provider: 'anthropic', modelName: 'claude-3-haiku-20240307' },
  { name: 'claude-3-5-sonnet', costTier: 'high', latencyMs: 1500, contextWindow: 200000, strengths: ['reasoning', 'complex-coding', 'analysis'], provider: 'anthropic', modelName: 'claude-3-5-sonnet-20241022' },
  { name: 'gemini-1.5-flash', costTier: 'low', latencyMs: 600, contextWindow: 1000000, strengths: ['long-context', 'multimodal'], provider: 'google', modelName: 'gemini-1.5-flash' },
  { name: 'gemini-1.5-pro', costTier: 'high', latencyMs: 2000, contextWindow: 2000000, strengths: ['reasoning', 'long-context', 'multimodal'], provider: 'google', modelName: 'gemini-1.5-pro' },
] as const satisfies ModelCapability[];

export type { ModelCapability };