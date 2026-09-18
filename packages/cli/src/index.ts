#!/usr/bin/env node
// @forge/cli — composition root and CLI entry point.
// This is where adapters get wired into core. Concrete adapter choices belong here.
import { runSingleAgentLoop } from '@forge/core';
import { ClaudeModelProvider, MockModelProvider } from '@forge/adapters';

interface RunOptions {
  task: string;
  mock?: boolean;
  model?: string;
  maxTurns?: number;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export async function forgeRun(options: RunOptions): Promise<{
  content: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  turns: number;
  completed: boolean;
}> {
  const modelProvider = options.mock
    ? new MockModelProvider({ defaultContent: `Mock result for: ${options.task}` })
    : new ClaudeModelProvider({
        ...(options.model ? { model: options.model } : {}),
      });

  const result = await runSingleAgentLoop(options.task, {
    modelProvider,
    systemPrompt: options.systemPrompt ?? 'You are a helpful coding assistant. Be concise.',
    maxTurns: options.maxTurns ?? 10,
    maxTokens: options.maxTokens ?? 4096,
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    ...(options.model ? { modelMetadata: { model: options.model } } : {}),
  });

  const lastResponse = result.responses[result.responses.length - 1];
  return {
    content: result.content,
    model: lastResponse?.model ?? 'unknown',
    usage: result.totalUsage,
    turns: result.turns,
    completed: result.completed,
  };
}

// CLI entry point — only runs when executed directly
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.error('Usage: forge run "<task>" [--mock] [--model <model>] [--max-turns <n>]');
    process.exit(args.length === 0 ? 1 : 0);
  }

  // Parse "run" subcommand
  const subcommand = args[0];
  if (subcommand !== 'run') {
    console.error(`Unknown command: ${subcommand}. Available: run`);
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
    console.error('---');

    // Output the result content to stdout
    process.stdout.write(result.content + '\n');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[forge] Error: ${message}`);
    process.exit(1);
  }
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
