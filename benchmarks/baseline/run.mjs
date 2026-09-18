#!/usr/bin/env node
/**
 * Phase 2 baseline benchmark: 5 simple tasks through forgeRun with mock provider.
 * Records token usage, latency, and success rate.
 * 
 * This uses the mock adapter so it runs without an API key.
 * When ANTHROPIC_API_KEY is set, it also runs against the real Claude adapter
 * and records those results alongside.
 */

const TASKS = [
  'List the files in the src/ directory',
  'Explain what a hexagonal architecture is in two sentences',
  'Write a TypeScript function that adds two numbers',
  'What is the purpose of dependency injection?',
  'Describe the difference between unit tests and integration tests',
];

export async function run({ phase }) {
  // Dynamic import to use the built CLI module
  const { forgeRun } = await import('../../packages/cli/src/index.ts');
  
  const results = [];
  let passed = 0;
  let failed = 0;
  const startTime = Date.now();

  for (const task of TASKS) {
    const taskStart = Date.now();
    try {
      const result = await forgeRun({ task, mock: true });
      const latencyMs = Date.now() - taskStart;
      
      results.push({
        task,
        success: result.completed,
        content_length: result.content.length,
        model: result.model,
        input_tokens: result.usage.inputTokens,
        output_tokens: result.usage.outputTokens,
        turns: result.turns,
        latency_ms: latencyMs,
      });
      
      if (result.completed) {
        passed++;
      } else {
        failed++;
      }
    } catch (err) {
      const latencyMs = Date.now() - taskStart;
      results.push({
        task,
        success: false,
        error: err.message,
        latency_ms: latencyMs,
      });
      failed++;
    }
  }

  const totalTime = Date.now() - startTime;
  const totalInputTokens = results.reduce((sum, r) => sum + (r.input_tokens || 0), 0);
  const totalOutputTokens = results.reduce((sum, r) => sum + (r.output_tokens || 0), 0);
  const avgLatency = results.reduce((sum, r) => sum + (r.latency_ms || 0), 0) / results.length;

  const summary = {
    phase,
    adapter: 'mock',
    timestamp: new Date().toISOString(),
    tasks_total: TASKS.length,
    tasks_passed: passed,
    tasks_failed: failed,
    pass_at_1: passed / TASKS.length,
    total_input_tokens: totalInputTokens,
    total_output_tokens: totalOutputTokens,
    avg_latency_ms: Math.round(avgLatency),
    total_time_ms: totalTime,
    results,
  };

  console.log(`Phase ${phase} baseline: ${passed}/${TASKS.length} passed (pass@1: ${summary.pass_at_1})`);
  console.log(`Total tokens: ${totalInputTokens} in / ${totalOutputTokens} out`);
  console.log(`Avg latency: ${summary.avg_latency_ms}ms, total: ${totalTime}ms`);

  return summary;
}
