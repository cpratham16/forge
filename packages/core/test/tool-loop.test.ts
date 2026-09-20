// Phase 3 orchestrator loop tests: tool execution, decoration equivalence,
// verification gate (A3 not_observed), stop-condition retry termination (A6).
import { describe, it, expect } from 'vitest';
import type {
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ToolCall,
  ToolContext,
  ToolPort,
  ToolResult,
  VerificationPort,
  VerificationResult,
} from '@runforge/contracts';
import { runSingleAgentLoop } from '../src/orchestrator/single-agent-loop.js';
import { TraceModelProviderDecorator } from '../src/trace/trace-model-decorator.js';
import { describeVerificationStatus, runVerificationGate } from '../src/verification/gate-runner.js';

class RecordingTool implements ToolPort {
  calls: ToolCall[] = [];
  respondWith: (call: ToolCall) => string = () => 'ok';

  async execute(call: ToolCall, _ctx: ToolContext): Promise<ToolResult> {
    this.calls.push(call);
    return { callId: call.id, output: this.respondWith(call) };
  }
}

/** Sequential mock provider: emits the given responses one per request. */
class SequenceProvider implements ModelProvider {
  requested: ModelRequest[] = [];
  constructor(private readonly responses: Array<() => ModelResponse>) {}

  async complete(input: ModelRequest): Promise<ModelResponse> {
    this.requested.push(input);
    const next = this.responses.shift();
    if (!next) {
      return { content: 'done', model: 'test', usage: { inputTokens: 0, outputTokens: 0 }, finishReason: 'stop' };
    }
    return next();
  }
}

function stopResponse(content = 'finished'): ModelResponse {
  return { content, model: 'test', usage: { inputTokens: 1, outputTokens: 1 }, finishReason: 'stop' };
}

function toolResponse(call: ToolCall): ModelResponse {
  return { content: '', model: 'test', usage: { inputTokens: 1, outputTokens: 1 }, finishReason: 'tool_calls', toolCalls: [call] };
}

class FailingVerifier implements VerificationPort {
  fails = 0;
  constructor(private readonly status: VerificationResult['status']) {}

  async verify(task: unknown, _output: unknown): Promise<VerificationResult> {
    const taskId = typeof task === 'object' && task !== null ? (task as { id: string }).id : 'task';
    this.fails++;
    return {
      taskId,
      status: this.status,
      evidence: [],
      timestamp: Date.now(),
      readinessLevel: 'draft',
    };
  }
}

describe('tool execution wired into the loop', () => {
  it('executes tool_calls through the toolPort and feeds results back to the model', async () => {
    const recording = new RecordingTool();
    const readCall: ToolCall = { id: 'tc-1', name: 'read_file', arguments: { path: 'a.txt' } };
    recording.respondWith = () => 'file contents';
    const provider = new SequenceProvider([() => toolResponse(readCall), () => stopResponse('read done')]);

    const result = await runSingleAgentLoop('read a file', {
      modelProvider: provider,
      toolPort: recording,
      maxTurns: 10,
    });

    expect(recording.calls).toHaveLength(1);
    expect(recording.calls[0]!.id).toBe('tc-1');
    expect(result.toolCalls).toBe(1);
    expect(result.completed).toBe(true);

    // The second model request must contain the tool result as a user message.
    const second = provider.requested[1]!;
    const toolResultMessage = second.messages.find((m) => m.content.includes('file contents'));
    expect(toolResultMessage).toBeDefined();
  });

  it('stops the loop when the model stops with no verifier wired', async () => {
    const provider = new SequenceProvider([() => stopResponse('plain stop')]);
    const result = await runSingleAgentLoop('task', { modelProvider: provider });
    expect(result.completed).toBe(true);
    expect(result.content).toBe('plain stop');
  });
});

describe('decoration equivalence — trace decorator does not change orchestrator behavior', () => {
  it('produces identical outputs and decisions with and without the decorator', async () => {
    interface SinkRecord {
      events: unknown[];
    }
    const sink: SinkRecord = { events: [] };

    async function run(withTrace: boolean) {
      const base = new SequenceProvider([() => toolResponse({ id: 'tc', name: 'run_command', arguments: { command: 'node -v' } }), () => stopResponse('verdict')]);
      let provider: ModelProvider = base;
      if (withTrace) {
        provider = new TraceModelProviderDecorator(provider, {
          trace: { record: (e) => sink.events.push(e), flush: async () => {} },
          agent: 'main',
          runId: 'r-1',
        });
      }
      const tools = new RecordingTool();
      const result = await runSingleAgentLoop('task', { modelProvider: provider, toolPort: tools, maxTurns: 10 });
      return result;
    }

    const plain = await run(false);
    const traced = await run(true);

    expect(traced.content).toBe(plain.content);
    expect(traced.turns).toBe(plain.turns);
    expect(traced.completed).toBe(plain.completed);
    expect(traced.toolCalls).toBe(plain.toolCalls);
    // The decorator recorded model traffic without orchestrator involvement.
    expect(sink.events.length).toBeGreaterThan(0);
    expect((sink.events[0] as { type: string }).type).toBe('model.request');
  });
});

describe('verification gate — no self-declared done', () => {
  it('approves completion when the verifier returns verified', async () => {
    const verifier: VerificationPort = {
      async verify(task: unknown, _output: unknown): Promise<VerificationResult> {
        return {
          taskId: (task as { id: string }).id,
          status: 'verified',
          evidence: [{ type: 'test_passed', detail: 'npm test passed', timestamp: Date.now() }],
          timestamp: Date.now(),
          readinessLevel: 'pr-ready',
        };
      },
    };

    const result = await runSingleAgentLoop('do the work', {
      modelProvider: new SequenceProvider([() => stopResponse('claims done')]),
      verifier,
      maxTurns: 5,
    });

    expect(result.completed).toBe(true);
    expect(result.verification?.status).toBe('verified');
    expect(result.turns).toBe(1);
  });

  it('A3 — not_observed is neither a pass nor silently rendered as a failure', async () => {
    const verifier = new FailingVerifier('not_observed');
    const provider = new SequenceProvider([() => stopResponse('claims done'), () => stopResponse('claims done again')]);

    const result = await runSingleAgentLoop('task', {
      modelProvider: provider,
      verifier,
      maxTurns: 5,
    });

    expect(result.completed).toBe(false);
    expect(result.verification?.status).toBe('not_observed');
    // The feedback message tells the agent no evidence existed, not that checks failed.
    const userMessages = provider.requested[1]!.messages.filter((m) => m.role === 'user');
    const feedback = userMessages[userMessages.length - 1]!;
    expect(feedback?.content).toContain('not observed');
    expect(feedback?.content).not.toContain('failed');
    // Rendering path preserves the distinction.
    expect(describeVerificationStatus('not_observed')).toBe('not observed');
  });

  it('does not count a failed verification as done and retries', async () => {
    const verifier = new FailingVerifier('failed');
    const provider = new SequenceProvider([() => stopResponse('attempt 1')]);

    const result = await runSingleAgentLoop('task', {
      modelProvider: provider,
      verifier,
      maxTurns: 1,
    });

    expect(result.completed).toBe(false);
    expect(result.verification?.status).toBe('failed');
  });

  it('gate-runner classifies each status honestly', async () => {
    const mk = (status: VerificationResult['status']): VerificationPort => ({
      async verify(task: unknown, _o: unknown): Promise<VerificationResult> {
        return { taskId: (task as { id: string }).id, status, evidence: [], timestamp: 0, readinessLevel: 'draft' };
      },
    });

    expect((await runVerificationGate(mk('verified'), { id: 't' }, 'o')).approved).toBe(true);
    const failed = await runVerificationGate(mk('failed'), { id: 't' }, 'o');
    expect(failed.approved).toBe(false);
    expect(failed.rejectionReason).toBe('failed');
    const skipped = await runVerificationGate(mk('skipped'), { id: 't' }, 'o');
    expect(skipped.rejectionReason).toBe('skipped');
  });
});

describe('A6 — stop conditions terminate the retry path', () => {
  it('terminates immediately when consecutive_failures threshold is reached', async () => {
    const verifier = new FailingVerifier('failed');
    const provider = new SequenceProvider([
      () => stopResponse('a'),
      () => stopResponse('b'),
      () => stopResponse('c'), // must never be reached
    ]);

    const result = await runSingleAgentLoop('task', {
      modelProvider: provider,
      verifier,
      stopConditions: [{ type: 'consecutive_failures', threshold: 2 }],
      maxTurns: 10,
    });

    expect(result.stopReason).toContain('stop-condition:consecutive_failures');
    expect(result.turns).toBe(2);
    expect(result.verification?.status).toBe('failed');
  });

  it('terminates on max_retries before exceeding the bound', async () => {
    const verifier = new FailingVerifier('failed');
    const provider = new SequenceProvider([() => stopResponse('a'), () => stopResponse('b')]);

    const result = await runSingleAgentLoop('task', {
      modelProvider: provider,
      verifier,
      stopConditions: [{ type: 'max_retries', threshold: 2 }],
      maxTurns: 10,
    });

    expect(result.stopReason).toContain('stop-condition:max_retries');
    expect(result.turns).toBe(2);
  });

  it('does not trip when the condition stays under the threshold', async () => {
    const provider = new SequenceProvider([() => stopResponse('a')]);
    const result = await runSingleAgentLoop('task', {
      modelProvider: provider,
      stopConditions: [{ type: 'max_retries', threshold: 5 }],
      maxTurns: 10,
    });

    expect(result.completed).toBe(true);
    expect(result.stopReason).toBeUndefined();
  });
});