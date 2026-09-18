#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Entrypoint for `pnpm bench:phase -- --phase <N> [--out <path>]`.
 *
 * Called by .opencode/agents/verifier.md and .github/workflows/benchmark-gate.yml.
 * Its output feeds scripts/compare-benchmark.mjs, so the JSON shape here and the
 * shape that script expects must stay in sync — change both or neither.
 *
 * STATUS: dispatcher only. The per-phase runners under benchmarks/ get built in
 * the phase that first needs them (Phase 2 onward, per docs/PHASED_PLAN.md).
 * Until a runner exists, this exits non-zero with a clear message rather than
 * emitting fake numbers — a benchmark gate that silently passes on invented
 * data is worse than no gate.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const getArg = (flag) => {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
};

const phase = Number(getArg('--phase'));
const out = getArg('--out') ?? `benchmarks/results/phase-${phase}-candidate.json`;

if (!Number.isInteger(phase) || phase < 0 || phase > 6) {
  console.error('Usage: pnpm bench:phase -- --phase <0-6> [--out <path>]');
  process.exit(2);
}

// docs/PHASED_PLAN.md defines no benchmark for phases 0 and 1. Say so and exit
// clean — the verifier reports this as N/A, not as a pass.
if (phase <= 1) {
  console.log(`Phase ${phase} has no benchmark defined in docs/PHASED_PLAN.md. Nothing to run.`);
  process.exit(0);
}

const RUNNERS = {
  2: 'benchmarks/baseline/run.mjs',       // 5 simple tasks, token/latency/success baseline
  3: 'benchmarks/terminal-bench/run.mjs', // 10 Terminal-Bench tasks via Harbor (Python CLI)
  4: 'benchmarks/oqs/run.mjs',            // MAFBench / OrchestrationBench / internal OQS
  5: 'benchmarks/terminal-bench/run.mjs', // full re-run + OQS five-dimension
  6: 'benchmarks/maf/run.mjs',            // specialization + framework overhead modules
};

const runnerPath = RUNNERS[phase];

if (!existsSync(runnerPath)) {
  console.error(
    `No benchmark runner at ${runnerPath} yet.\n` +
      `Phase ${phase} requires it per docs/PHASED_PLAN.md. Build it as part of this phase's\n` +
      `deliverables before the gate can pass. Not emitting placeholder results.`,
  );
  process.exit(1);
}

const { run } = await import(`../${runnerPath}`);
const result = await run({ phase });

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ phase, ...result }, null, 2));
console.log(`Wrote ${out}`);
