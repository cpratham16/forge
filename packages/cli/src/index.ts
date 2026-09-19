#!/usr/bin/env node
// @runforge/cli — composition root and CLI entry point.
// This is where adapters get wired into core. Concrete adapter choices belong here.
import { runSingleAgentLoop, TraceModelProviderDecorator, DefaultPolicyPort, PolicyToolDecorator } from '@runforge/core';
import {
  ClaudeModelProvider,
  MockModelProvider,
  FilesystemTool,
  ShellTool,
  GitTool,
  SearchTool,
  ToolRegistry,
  ShellCommandVerifier,
  JsonlTraceSink,
  createCapabilityIsolationDecorator,
  type VerifierCommand,
} from '@runforge/adapters';
import type { ModelProvider, ModelRequest, ModelResponse, PolicyGrant, StopCondition, ToolCall } from '@runforge/contracts';
import { traceList, traceShow } from './commands/trace.js';
import { conformanceCommand } from './commands/conformance.js';

interface RunOptions {
  task: string;
  mock?: boolean;
  model?: string;
  maxTurns?: number;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  workspace?: string;
  /** Mock-only: scripted tool calls the mock "model" emits before stopping. */
  mockToolPlan?: ToolCall[];
  /** Wire the evidence gate: completion only when these commands pass. */
  verify?: { commands: VerifierCommand[] };
  /** Record model traffic through the trace decorator to a JSONL sink. */
  trace?: boolean;
  traceDir?: string;
  runId?: string;
  stopConditions?: StopCondition[];
  grants?: PolicyGrant[];
}

export interface ForgeRunResult {
  content: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  turns: number;
  completed: boolean;
  runId?: string;
  verificationStatus?: string;
  readinessLevel?: string;
  stopReason?: string;
}

function newRunId(): string {
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildMockPlanHandler(plan: ToolCall[], finalContent: string): (request: ModelRequest) => ModelResponse {
  let index = 0;
  return (_request: ModelRequest): ModelResponse => {
    if (index < plan.length) {
      const call = plan[index]!;
      index++;
      return {
        content: '',
        toolCalls: [call],
        model: 'mock-model',
        usage: { inputTokens: 10, outputTokens: 5 },
        finishReason: 'tool_calls',
      };
    }
    return {
      content: finalContent,
      model: 'mock-model',
      usage: { inputTokens: 10, outputTokens: 5 },
      finishReason: 'stop',
    };
  };
}

export async function forgeRun(options: RunOptions): Promise<ForgeRunResult> {
  let modelProvider: ModelProvider = options.mock
    ? new MockModelProvider({ defaultContent: `Mock result for: ${options.task}` })
    : new ClaudeModelProvider({ ...(options.model ? { model: options.model } : {}) });

  if (options.mock && options.mockToolPlan !== undefined && options.mockToolPlan.length > 0) {
    modelProvider = new MockModelProvider({
      handler: buildMockPlanHandler(options.mockToolPlan, `Mock completion for: ${options.task}`),
    });
  }

  const runId = options.runId ?? newRunId();

  let traceSink: JsonlTraceSink | undefined;
  if (options.trace) {
    traceSink = new JsonlTraceSink({ dir: options.traceDir ?? '.forge/traces' });
    modelProvider = new TraceModelProviderDecorator(modelProvider, { trace: traceSink, agent: 'main', runId });
  }

  const registry = new ToolRegistry([new FilesystemTool(), new ShellTool(), new GitTool(), new SearchTool()]);
  const policy = new DefaultPolicyPort(options.grants !== undefined ? { grants: options.grants } : {});
  const policyPort = new PolicyToolDecorator(registry, { policy, agent: 'main' });
  // Capability isolation is the OUTERMOST decorator: it runs before the
  // configurable policy engine, and the compiled-in control-plane floor is
  // enforced regardless of FORGE_CONTROL_* env or forge.yaml (PRD §5).
  const toolPort = createCapabilityIsolationDecorator(policyPort, { agent: 'main' });

  const verifier =
    options.verify !== undefined
      ? new ShellCommandVerifier({
          commands: options.verify.commands,
          repoRoot: options.workspace ?? '.',
          taskId: runId,
        })
      : undefined;

  const result = await runSingleAgentLoop(options.task, {
    modelProvider,
    systemPrompt: options.systemPrompt ?? 'You are a helpful coding assistant. Be concise.',
    maxTurns: options.maxTurns ?? 10,
    maxTokens: options.maxTokens ?? 4096,
    tools: registry.toolDefinitions(),
    toolPort,
    taskId: runId,
    workspace: options.workspace ?? '.',
    ...(verifier !== undefined ? { verifier } : {}),
    ...(options.stopConditions !== undefined ? { stopConditions: options.stopConditions } : {}),
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    ...(options.model ? { modelMetadata: { model: options.model } } : {}),
  });

  if (traceSink !== undefined) await traceSink.flush();

  const lastResponse = result.responses[result.responses.length - 1];
  return {
    content: result.content,
    model: lastResponse?.model ?? 'unknown',
    usage: result.totalUsage,
    turns: result.turns,
    completed: result.completed,
    ...(options.trace ? { runId } : {}),
    ...(result.verification !== undefined
      ? {
          verificationStatus: result.verification.status,
          readinessLevel: result.verification.readinessLevel,
        }
      : {}),
    ...(result.stopReason !== undefined ? { stopReason: result.stopReason } : {}),
  };
}

// CLI entry point — only runs when executed directly
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.error(
      'Usage: forge run "<task>" [--mock] [--model <model>] [--max-turns <n>]\n' +
        '       forge trace show <run-id> [--dir <trace-dir>]\n' +
        '       forge trace list [--dir <trace-dir>]\n' +
        '       forge conformance [--json] [--port <port>]',
    );
    process.exit(args.length === 0 ? 1 : 0);
  }

  const subcommand = args[0];

  if (subcommand === 'trace') {
    await handleTrace(args.slice(1));
    return;
  }

  if (subcommand === 'conformance') {
    const output = await conformanceCommand(args.slice(1));
    process.stdout.write(`${output}\n`);
    return;
  }

  if (subcommand !== 'run') {
    console.error(`Unknown command: ${subcommand}. Available: run, trace, conformance`);
    process.exit(1);
  }

  const task = args[1];
  if (!task) {
    console.error('Error: task argument required. Usage: forge run "<task>"');
    process.exit(1);
  }

  const useMock = args.includes('--mock');
  const modelIdx = args.indexOf('--model');
  const model = modelIdx !== -1 ? args[modelIdx + 1] : undefined;
  const maxTurnsIdx = args.indexOf('--max-turns');
  const maxTurns = maxTurnsIdx !== -1 ? parseInt(args[maxTurnsIdx + 1] ?? '10', 10) : undefined;

  console.error(`[forge] Running task: ${task}`);
  if (useMock) {
    console.error('[forge] Using mock model provider');
  }

  try {
    const result = await forgeRun({
      task,
      mock: useMock,
      ...(model ? { model } : {}),
      ...(maxTurns !== undefined ? { maxTurns } : {}),
    });

    console.error(`[forge] Model: ${result.model}`);
    console.error(`[forge] Turns: ${result.turns}`);
    console.error(`[forge] Tokens: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out`);
    console.error(`[forge] Completed: ${result.completed}`);
    if (result.verificationStatus !== undefined) {
      console.error(`[forge] Verification: ${result.verificationStatus} (readiness: ${result.readinessLevel})`);
    }
    if (result.stopReason !== undefined) {
      console.error(`[forge] Stopped: ${result.stopReason}`);
    }
    console.error('---');

    process.stdout.write(result.content + '\n');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[forge] Error: ${message}`);
    process.exit(1);
  }
}

async function handleTrace(traceArgs: string[]): Promise<void> {
  const sub = traceArgs[0];
  const dirIdx = traceArgs.indexOf('--dir');
  const dir = dirIdx !== -1 ? traceArgs[dirIdx + 1] : undefined;

  if (sub === 'list') {
    process.stdout.write(`${await traceList(dir)}\n`);
    return;
  }

  if (sub === 'show') {
    const runId = traceArgs[1];
    if (!runId) {
      console.error('Error: run-id required. Usage: forge trace show <run-id> [--dir <trace-dir>]');
      process.exit(1);
    }
    process.stdout.write(`${await traceShow(runId, dir)}\n`);
    return;
  }

  console.error('Error: trace expects a subcommand. Available: show, list');
  process.exit(1);
}

// Run main if this is the entry point
const isMainModule =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('index.ts') || process.argv[1].endsWith('index.js'));

if (isMainModule) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}