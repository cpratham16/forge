// Single-agent orchestrator loop.
// Depends ONLY on @forge/contracts (injected ports). Never imports adapters or SDKs.
import type {
  ModelProvider,
  ModelRequest,
  ModelResponse,
  Message,
  ToolDefinition,
} from '@forge/contracts';

export interface OrchestratorConfig {
  /** The model provider to use (injected) */
  modelProvider: ModelProvider;
  /** System prompt for the agent */
  systemPrompt?: string;
  /** Maximum number of turns in the loop */
  maxTurns?: number;
  /** Model-level metadata (e.g. model name override) */
  modelMetadata?: Record<string, unknown>;
  /** Maximum tokens per response */
  maxTokens?: number;
  /** Temperature for the model */
  temperature?: number;
  /** Tool definitions available to the agent */
  tools?: ToolDefinition[];
}

export interface OrchestratorResult {
  /** Final text content from the agent */
  content: string;
  /** All responses produced during the loop */
  responses: ModelResponse[];
  /** Total token usage across all turns */
  totalUsage: { inputTokens: number; outputTokens: number };
  /** Number of turns taken */
  turns: number;
  /** Whether the loop completed normally (vs. hitting maxTurns) */
  completed: boolean;
}

/**
 * Runs a single-agent loop:
 * 1. Send user message to model
 * 2. If model returns tool_calls, we would execute tools (Phase 3)
 *    — for now, we stop after tool_calls since ToolPort isn't wired yet
 * 3. If model returns 'stop', we're done
 * 4. If model returns 'length', we've hit the token limit
 * 5. Loop up to maxTurns
 */
export async function runSingleAgentLoop(
  task: string,
  config: OrchestratorConfig,
): Promise<OrchestratorResult> {
  const maxTurns = config.maxTurns ?? 10;
  const responses: ModelResponse[] = [];
  const totalUsage = { inputTokens: 0, outputTokens: 0 };

  const messages: Message[] = [];

  // Add system message if provided
  if (config.systemPrompt) {
    messages.push({ role: 'system', content: config.systemPrompt });
  }

  // Add the user task
  messages.push({ role: 'user', content: task });

  let lastContent = '';
  let completed = false;

  for (let turn = 0; turn < maxTurns; turn++) {
    const request: ModelRequest = {
      messages: [...messages],
      ...(config.tools ? { tools: config.tools } : {}),
      ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
      ...(config.maxTokens !== undefined ? { maxTokens: config.maxTokens } : {}),
      ...(config.modelMetadata ? { metadata: config.modelMetadata } : {}),
    };

    const response = await config.modelProvider.complete(request);
    responses.push(response);
    totalUsage.inputTokens += response.usage.inputTokens;
    totalUsage.outputTokens += response.usage.outputTokens;

    lastContent = response.content;

    if (response.finishReason === 'stop') {
      completed = true;
      break;
    }

    if (response.finishReason === 'tool_calls') {
      // Phase 2: we don't have ToolPort wired yet.
      // Record the assistant message with tool calls and stop.
      // In Phase 3, this will execute tools and continue the loop.
      messages.push({ role: 'assistant', content: response.content || 'Tool calls requested.' });
      completed = true;
      break;
    }

    if (response.finishReason === 'length') {
      // Token limit hit — record what we have and stop
      // (cannot continue meaningfully because response was truncated)
      messages.push({ role: 'assistant', content: response.content });
      completed = true;
      break;
    }

    if (response.finishReason === 'error') {
      break;
    }

    // Add assistant response to conversation for multi-turn
    messages.push({ role: 'assistant', content: response.content });
  }

  return {
    content: lastContent,
    responses,
    totalUsage,
    turns: responses.length,
    completed,
  };
}
