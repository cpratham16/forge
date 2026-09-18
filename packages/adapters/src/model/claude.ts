// Claude ModelProvider adapter — implements ModelProvider using @anthropic-ai/sdk.
// All vendor-specific types stay inside this file; the return types are pure contracts.
import Anthropic from '@anthropic-ai/sdk';
import type {
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ToolCall,
  AdapterConformance,
} from '@forge/contracts';

export interface ClaudeModelProviderOptions {
  apiKey?: string;
  model?: string;
  maxRetries?: number;
  timeout?: number;
}

export class ClaudeModelProvider implements ModelProvider {
  private readonly client: Anthropic;
  private readonly defaultModel: string;

  constructor(options: ClaudeModelProviderOptions = {}) {
    this.client = new Anthropic({
      apiKey: options.apiKey ?? process.env['ANTHROPIC_API_KEY'],
      maxRetries: options.maxRetries ?? 2,
      timeout: options.timeout ?? 60_000,
    });
    this.defaultModel = options.model ?? 'claude-sonnet-4-5';
  }

  async complete(input: ModelRequest): Promise<ModelResponse> {
    const systemMessage = input.messages.find((m) => m.role === 'system');
    const nonSystemMessages = input.messages.filter((m) => m.role !== 'system');

    // Map tools to Anthropic format
    const tools: Anthropic.Tool[] | undefined = input.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: {
        type: 'object' as const,
        properties: t.parameters,
      },
    }));

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: input.metadata?.['model'] as string ?? this.defaultModel,
      max_tokens: input.maxTokens ?? 4096,
      messages: nonSystemMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      ...(systemMessage ? { system: systemMessage.content } : {}),
      ...(tools && tools.length > 0 ? { tools } : {}),
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    };

    const response = await this.client.messages.create(params);

    // Extract text content and tool calls
    let textContent = '';
    const toolCalls: ToolCall[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, unknown>,
        });
      }
    }

    // Map stop_reason to our finishReason
    const finishReason = mapStopReason(response.stop_reason);

    return {
      content: textContent,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      finishReason,
    };
  }

  static conformance(): AdapterConformance {
    return {
      adapterName: 'claude',
      portName: 'ModelProvider',
      enforcedGuarantees: [
        'returns-valid-model-response',
        'respects-tool-definitions',
        'reports-token-usage',
        'actual-llm-inference',
        'real-token-counting',
      ],
      unenforcedGuarantees: [
        'streaming',
        'prompt-caching',
      ],
      limitations: [
        'Requires ANTHROPIC_API_KEY environment variable',
        'Network access required',
        'Subject to Anthropic API rate limits and availability',
        'Does not support streaming (non-streaming only)',
      ],
    };
  }
}

function mapStopReason(
  stopReason: string | null,
): 'stop' | 'tool_calls' | 'length' | 'error' {
  switch (stopReason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'stop';
    case 'tool_use':
      return 'tool_calls';
    case 'max_tokens':
      return 'length';
    default:
      return 'error';
  }
}
