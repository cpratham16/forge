// TraceModelProviderDecorator — POLAR pattern (PHASED_PLAN Phase 3, A /
// reference POLAR): tracing happens at the model-API call boundary, as a
// decorator around ModelProvider, WITHOUT touching the orchestrator.
//
// Guarantee: behaviour of the wrapped provider is unchanged — the same
// response object flows through untouched. Recording failures are swallowed:
// tracing must never break a model call.
import type { ModelProvider, ModelRequest, ModelResponse, TraceEvent, TracePort } from '@runforge/contracts';

export interface TraceModelDecoratorOptions {
  trace: TracePort;
  agent?: string;
  runId?: string;
}

let sequence = 0;

function newId(): string {
  sequence = (sequence + 1) % 1e9;
  return `${Date.now().toString(36)}-${sequence.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function resolveRunId(input: ModelRequest, fallback: string): string {
  const metadataRunId = input.metadata?.runId;
  return typeof metadataRunId === 'string' ? metadataRunId : fallback;
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…(truncated)`;
}

export class TraceModelProviderDecorator implements ModelProvider {
  private readonly inner: ModelProvider;
  private readonly trace: TracePort;
  private readonly agent: string;
  private readonly defaultRunId: string;

  constructor(inner: ModelProvider, options: TraceModelDecoratorOptions) {
    this.inner = inner;
    this.trace = options.trace;
    this.agent = options.agent ?? 'agent';
    this.defaultRunId = options.runId ?? newId();
  }

  async complete(input: ModelRequest): Promise<ModelResponse> {
    const runId = resolveRunId(input, this.defaultRunId);

    const requestEvent: TraceEvent = {
      id: newId(),
      timestamp: Date.now(),
      type: 'model.request',
      agent: this.agent,
      payload: {
        runId,
        messages: input.messages.map((m) => ({ role: m.role, content: truncate(m.content, 500) })),
        tools: (input.tools ?? []).map((t) => t.name),
      },
    };

    this.emit(requestEvent);

    let response: ModelResponse;
    try {
      response = await this.inner.complete(input);
    } catch (err) {
      this.emit({
        id: newId(),
        parentId: requestEvent.id,
        timestamp: Date.now(),
        type: 'model.response',
        agent: this.agent,
        payload: { runId, error: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }

    this.emit({
      id: newId(),
      parentId: requestEvent.id,
      timestamp: Date.now(),
      type: 'model.response',
      agent: this.agent,
      payload: {
        runId,
        content: truncate(response.content, 500),
        finishReason: response.finishReason,
        usage: response.usage,
        toolCalls: (response.toolCalls ?? []).map((c) => ({ id: c.id, name: c.name })),
      },
    });

    return response;
  }

  private emit(event: TraceEvent): void {
    try {
      this.trace.record(event);
    } catch {
      // Tracing must never break the wrapped model call.
    }
  }
}