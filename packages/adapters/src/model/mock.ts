// Mock ModelProvider adapter — used as the contract test baseline.
// The real Claude adapter must pass the same behavioral tests.
import type {
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ToolCall,
  AdapterConformance,
} from '@forge/contracts';

export interface MockModelProviderOptions {
  /** Fixed response content for simple requests */
  defaultContent?: string;
  /** Fixed model name reported in responses */
  modelName?: string;
  /** If provided, these tool calls are returned when the request includes tools */
  toolCalls?: ToolCall[];
  /** If provided, this function generates the response dynamically */
  handler?: (request: ModelRequest) => ModelResponse;
}

export class MockModelProvider implements ModelProvider {
  private readonly options: Required<Pick<MockModelProviderOptions, 'defaultContent' | 'modelName'>> & MockModelProviderOptions;
  private readonly _calls: ModelRequest[] = [];

  constructor(options: MockModelProviderOptions = {}) {
    this.options = {
      defaultContent: options.defaultContent ?? 'Mock response',
      modelName: options.modelName ?? 'mock-model',
      ...options,
    };
  }

  async complete(input: ModelRequest): Promise<ModelResponse> {
    this._calls.push(input);

    if (this.options.handler) {
      return this.options.handler(input);
    }

    const hasTools = input.tools && input.tools.length > 0;
    const toolCalls = this.options.toolCalls;

    if (hasTools && toolCalls && toolCalls.length > 0) {
      return {
        content: '',
        toolCalls,
        model: this.options.modelName,
        usage: { inputTokens: 10, outputTokens: 5 },
        finishReason: 'tool_calls',
      };
    }

    return {
      content: this.options.defaultContent,
      model: this.options.modelName,
      usage: { inputTokens: 10, outputTokens: 5 },
      finishReason: 'stop',
    };
  }

  /** Access recorded calls for test assertions */
  get calls(): readonly ModelRequest[] {
    return this._calls;
  }

  /** Reset recorded calls */
  reset(): void {
    this._calls.length = 0;
  }

  static conformance(): AdapterConformance {
    return {
      adapterName: 'mock',
      portName: 'ModelProvider',
      enforcedGuarantees: [
        'returns-valid-model-response',
        'respects-tool-definitions',
        'reports-token-usage',
      ],
      unenforcedGuarantees: [
        'actual-llm-inference',
        'real-token-counting',
        'streaming',
      ],
      limitations: [
        'Returns fixed responses only',
        'Token counts are hardcoded',
        'No actual language model behind it',
      ],
    };
  }
}
