// TraceModelProviderDecorator tests (PHASED_PLAN Phase 3, M8): tracing records
// at the model-API boundary without touching the orchestrator, and never breaks
// the wrapped model call.
import { describe, it, expect, beforeEach } from 'vitest';
import type { ModelProvider, ModelRequest, ModelResponse, TraceEvent, TracePort } from '@forge/contracts';
import { TraceModelProviderDecorator } from '../src/trace/trace-model-decorator.js';

class MemoryTrace implements TracePort {
  events: TraceEvent[] = [];
  record(event: TraceEvent): void {
    this.events.push(event);
  }
  async flush(): Promise<void> {}

  requestEvents() {
    return this.events.filter((e) => e.type === 'model.request');
  }
  responseEvents() {
    return this.events.filter((e) => e.type === 'model.response');
  }
}

class StubProvider implements ModelProvider {
  calls = 0;
  constructor(
    private readonly response: ModelResponse,
    private readonly failWith?: Error,
  ) {}

  async complete(_input: ModelRequest): Promise<ModelResponse> {
    this.calls++;
    if (this.failWith) throw this.failWith;
    return { ...this.response, toolCalls: this.response.toolCalls ? [...this.response.toolCalls] : undefined };
  }
}

const request: ModelRequest = {
  messages: [{ role: 'user', content: 'hi' }],
  tools: [{ name: 'read_file', description: 'read', parameters: {} }],
};

describe('TraceModelProviderDecorator', () => {
  let trace: MemoryTrace;
  let inner: StubProvider;

  beforeEach(() => {
    trace = new MemoryTrace();
    inner = new StubProvider({
      content: 'hello',
      model: 'test',
      usage: { inputTokens: 3, outputTokens: 2 },
      finishReason: 'stop',
    });
  });

  it('emits a model.request event before calling the inner provider', async () => {
    const decorator = new TraceModelProviderDecorator(inner, { trace, agent: 'main', runId: 'r1' });
    await decorator.complete(request);

    expect(trace.requestEvents()).toHaveLength(1);
    const req = trace.requestEvents()[0]!;
    expect(req.agent).toBe('main');
    expect(req.payload.runId).toBe('r1');
    expect(req.payload.tools).toEqual(['read_file']);
  });

  it('emits a model.response event and returns the response unchanged', async () => {
    const decorator = new TraceModelProviderDecorator(inner, { trace, agent: 'main', runId: 'r1' });
    const result = await decorator.complete(request);

    expect(result.content).toBe('hello');
    expect(result.usage).toEqual({ inputTokens: 3, outputTokens: 2 });
    expect(trace.responseEvents()).toHaveLength(1);
    const res = trace.responseEvents()[0]!;
    expect(res.parentId).toBe(trace.requestEvents()[0]!.id);
    expect(res.payload.finishReason).toBe('stop');
  });

  it('links response events to their request via parentId (runId passthrough)', async () => {
    const decorator = new TraceModelProviderDecorator(inner, { trace, agent: 'm' });
    const withMeta: ModelRequest = { ...request, metadata: { runId: 'explicit' } };
    await decorator.complete(withMeta);

    expect(trace.requestEvents()[0]!.payload.runId).toBe('explicit');
  });

  it('records a failed call as an error model.response and rethrows', async () => {
    const failing = new StubProvider({ content: '', model: 't', usage: { inputTokens: 0, outputTokens: 0 }, finishReason: 'stop' }, new Error('boom'));
    const decorator = new TraceModelProviderDecorator(failing, { trace, agent: 'main', runId: 'r1' });

    await expect(decorator.complete(request)).rejects.toThrow('boom');
    const errorEvent = trace.responseEvents()[0];
    expect(errorEvent?.payload.error).toBe('boom');
    expect(errorEvent?.parentId).toBe(trace.requestEvents()[0]!.id);
  });

  it('never breaks the model call when recording throws', async () => {
    const brokenTrace: TracePort = {
      record(): void {
        throw new Error('disk full');
      },
      async flush(): Promise<void> {},
    };
    const decorator = new TraceModelProviderDecorator(inner, { trace: brokenTrace, agent: 'main', runId: 'r1' });

    const result = await decorator.complete(request);

    expect(result.content).toBe('hello');
    expect(inner.calls).toBe(1);
  });
});