import type {
  AdapterConformance,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ToolCall,
  ToolDefinition,
} from '@runforge/contracts';

export interface OpenAICompatibleOptions {
  baseUrl: string;
  apiKey?: string;
  model: string;
  maxRetries?: number;
  timeout?: number;
  defaultHeaders?: Record<string, string>;
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  tools?: OpenAITool[] | undefined;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: OpenAIMessage;
    finish_reason: string | null;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIError {
  error: {
    message: string;
    type: string;
    code?: string;
  };
}

function mapFinishReason(reason: string | null): 'stop' | 'tool_calls' | 'length' | 'error' {
  switch (reason) {
    case 'stop':
    case 'end_turn':
      return 'stop';
    case 'tool_calls':
    case 'tool_use':
      return 'tool_calls';
    case 'length':
    case 'max_tokens':
      return 'length';
    default:
      return 'error';
  }
}

function toOpenAIMessages(messages: ModelRequest['messages']): OpenAIMessage[] {
  return messages.map((m) => {
    const msg: OpenAIMessage = { role: m.role, content: m.content };
    return msg;
  });
}

function toOpenAITools(tools?: ToolDefinition[]): OpenAITool[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

function fromOpenAIResponse(response: OpenAIResponse): ModelResponse {
  const choice = response.choices[0];
  if (!choice) {
    throw new Error('Empty response from OpenAI-compatible API');
  }

  const message = choice.message;
  const toolCalls: ToolCall[] = [];

  if (message.tool_calls) {
    for (const tc of message.tool_calls) {
      try {
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments),
        });
      } catch {
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          arguments: {},
        });
      }
    }
  }

  return {
    content: message.content ?? '',
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
    model: response.model,
    usage: {
      inputTokens: response.usage.prompt_tokens,
      outputTokens: response.usage.completion_tokens,
    },
    finishReason: mapFinishReason(choice.finish_reason),
  };
}

function buildHeaders(options: OpenAICompatibleOptions): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.defaultHeaders,
  };
  if (options.apiKey) {
    headers['Authorization'] = `Bearer ${options.apiKey}`;
  }
  return headers;
}

export class OpenAICompatibleModelProvider implements ModelProvider {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly maxRetries: number;
  private readonly timeout: number;
  private readonly headers: Record<string, string>;

  constructor(options: OpenAICompatibleOptions) {
    if (!options.baseUrl) {
      throw new Error('OpenAICompatibleModelProvider requires baseUrl');
    }
    if (!options.model) {
      throw new Error('OpenAICompatibleModelProvider requires model');
    }

    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.model = options.model;
    this.maxRetries = options.maxRetries ?? 2;
    this.timeout = options.timeout ?? 60_000;
    this.headers = buildHeaders(options);
  }

  async complete(input: ModelRequest): Promise<ModelResponse> {
    const requestBody: OpenAIRequest = {
      model: this.model,
      messages: toOpenAIMessages(input.messages),
      ...(input.tools && input.tools.length > 0 ? { tools: toOpenAITools(input.tools) } : {}),
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      ...(input.maxTokens !== undefined ? { max_tokens: input.maxTokens } : {}),
      stream: false,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({
            error: { message: `HTTP ${response.status}: ${response.statusText}`, type: 'http_error' },
          })) as OpenAIError;
          throw new Error(`${errorData.error.type}: ${errorData.error.message}`);
        }

        const data = await response.json() as OpenAIResponse;
        return fromOpenAIResponse(data);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < this.maxRetries) {
          const delay = Math.min(1000 * 2 ** attempt, 10_000);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    throw lastError ?? new Error('OpenAICompatibleModelProvider: max retries exceeded');
  }

  static conformance(): AdapterConformance {
    return {
      adapterName: 'openai-compatible',
      portName: 'ModelProvider',
      enforcedGuarantees: [
        'returns-valid-model-response',
        'respects-tool-definitions',
        'reports-token-usage',
        'actual-llm-inference',
        'real-token-counting',
        'supports-system-messages',
        'supports-temperature',
        'supports-max-tokens',
        'retry-with-backoff',
      ],
      unenforcedGuarantees: [
        'streaming',
        'prompt-caching',
        'parallel-tool-calls',
      ],
      limitations: [
        'Requires OpenAI-compatible endpoint (Ollama, OpenRouter, Groq, etc.)',
        'Network access required',
        'Subject to endpoint rate limits and availability',
        'Non-streaming only (streaming planned for Phase 7)',
        'Token counts depend on upstream provider accuracy',
      ],
    };
  }
}