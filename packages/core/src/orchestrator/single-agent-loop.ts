// Single-agent orchestrator loop.
// Depends ONLY on @runforge/contracts (injected ports). Never imports adapters or SDKs.
//
// Phase 3 additions (all injected, none imported):
//   - toolPort:       tool_calls are executed and results fed back as messages
//   - verifier:       "no self-declared done" gate — 'stop' is only a real
//                     completion when the VerificationPort approves from evidence
//   - stopConditions: checked before every retry attempt (A6)
import type {
  Message,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  PolicyDecision,
  StopCondition,
  ToolCall,
  ToolContext,
  ToolDefinition,
  ToolPort,
  ToolResult,
  VerificationPort,
  VerificationResult,
} from '@runforge/contracts';
import { describeVerificationStatus, runVerificationGate } from '../verification/gate-runner.js';
import { checkStopConditions, type StopRunState } from './stop-conditions.js';

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
  /** Tool execution port — makes tool_calls actually run (Phase 3) */
  toolPort?: ToolPort;
  /** Verification port — completion is decided from evidence, not claims */
  verifier?: VerificationPort;
  /** Stop conditions checked before every retry attempt (A6) */
  stopConditions?: StopCondition[];
  /** Identifier used for the Task passed to the verifier */
  taskId?: string;
  /** Workspace exposed to tools via ToolContext */
  workspace?: string;
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
  /** Whether the loop completed through the evidence gate (or plain 'stop') */
  completed: boolean;
  /** Final verification result when a verifier was wired */
  verification?: VerificationResult;
  /** Why the loop stopped when it did not complete normally */
  stopReason?: string;
  /** Number of tool calls executed */
  toolCalls?: number;
}

function toolResultMessage(call: ToolCall, result: ToolResult): Message {
  const output = result.output === '' ? '(no output)' : result.output;
  return {
    role: 'user',
    content: `[Tool result: ${call.name} (${call.id})]\n${output}${result.error ? `\nERROR: ${result.error}` : ''}`,
  };
}

function verificationFeedback(result: VerificationResult): string {
  if (result.status === 'not_observed') {
    return (
      'Verification produced no evidence (status: not observed). Do not declare the task done — ' +
      'run the required build/test/lint checks so completion can be decided from evidence.'
    );
  }
  const lines = result.evidence.map((e) => `- [${e.type}] ${e.detail}`).join('\n');
  return (
    `Verification did not pass (status: ${describeVerificationStatus(result.status)}, ` +
    `readiness: ${result.readinessLevel}).\nEvidence:\n${lines}\nFix the issues and try again.`
  );
}

/**
 * Runs a single-agent loop:
 * 1. Send user message to model
 * 2. tool_calls → execute via toolPort (if wired), feed results back, continue
 * 3. 'stop' → ask the verifier (if wired); approved means done, otherwise retry
 * 4. Stop conditions are checked before every retry attempt (A6)
 */
export async function runSingleAgentLoop(
  task: string,
  config: OrchestratorConfig,
): Promise<OrchestratorResult> {
  const maxTurns = config.maxTurns ?? 10;
  const responses: ModelResponse[] = [];
  const totalUsage = { inputTokens: 0, outputTokens: 0 };

  const messages: Message[] = [];
  if (config.systemPrompt) {
    messages.push({ role: 'system', content: config.systemPrompt });
  }
  messages.push({ role: 'user', content: task });

  const taskId = config.taskId ?? 'task';
  const startTime = Date.now();
  let lastContent = '';
  let completed = false;
  let stopReason: string | undefined;
  let verification: VerificationResult | undefined;
  let toolCallCount = 0;
  let consecutiveFailures = 0;
  let attempts = 0;

  for (;;) {
    const state: StopRunState = {
      attempts,
      consecutiveFailures,
      elapsedMs: Date.now() - startTime,
      totalTokens: totalUsage.inputTokens + totalUsage.outputTokens,
    };

    const stopped = config.stopConditions !== undefined && config.stopConditions.length > 0
      ? checkStopConditions(config.stopConditions, state)
      : undefined;
    if (stopped) {
      stopReason = `stop-condition:${stopped.type} (threshold ${stopped.threshold}, reached ${stopped.value})`;
      break;
    }

    if (attempts >= maxTurns) {
      stopReason = 'max-turns';
      break;
    }

    const request: ModelRequest = {
      messages: [...messages],
      ...(config.tools ? { tools: config.tools } : {}),
      ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
      ...(config.maxTokens !== undefined ? { maxTokens: config.maxTokens } : {}),
      ...(config.modelMetadata ? { metadata: config.modelMetadata } : {}),
    };

    const response = await config.modelProvider.complete(request);
    responses.push(response);
    attempts++;
    totalUsage.inputTokens += response.usage.inputTokens;
    totalUsage.outputTokens += response.usage.outputTokens;

    lastContent = response.content;

    if (response.finishReason === 'stop') {
      messages.push({ role: 'assistant', content: response.content });

      if (config.verifier) {
        const gate = await runVerificationGate(config.verifier, { id: taskId, objective: task }, lastContent);
        verification = gate.result;
        if (gate.approved) {
          completed = true;
          break;
        }
        consecutiveFailures++;
        messages.push({ role: 'user', content: verificationFeedback(gate.result) });
        continue;
      }

      completed = true;
      break;
    }

    if (response.finishReason === 'tool_calls') {
      messages.push({ role: 'assistant', content: response.content || 'Tool calls requested.' });

      if (!config.toolPort) {
        completed = true;
        break;
      }

      const toolCalls = response.toolCalls ?? [];
      const ctx: ToolContext = {
        workspace: config.workspace ?? '.',
        permissions: { outcome: 'allow', rationale: 'orchestrator-default' } satisfies PolicyDecision,
      };

      for (const call of toolCalls) {
        toolCallCount++;
        let result: ToolResult;
        try {
          result = await config.toolPort.execute(call, ctx);
        } catch (err) {
          result = {
            callId: call.id,
            output: '',
            error: `tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
        messages.push(toolResultMessage(call, result));
      }
      continue;
    }

    if (response.finishReason === 'length') {
      messages.push({ role: 'assistant', content: response.content });
      completed = true;
      break;
    }

    if (response.finishReason === 'error') {
      stopReason = 'model-error';
      break;
    }

    messages.push({ role: 'assistant', content: response.content });
  }

  return {
    content: lastContent,
    responses,
    totalUsage,
    turns: responses.length,
    completed,
    ...(verification !== undefined ? { verification } : {}),
    ...(stopReason !== undefined ? { stopReason } : {}),
    toolCalls: toolCallCount,
  };
}