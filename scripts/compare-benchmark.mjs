#!/usr/bin/env node
/* eslint-disable no-console */
// Compares a candidate phase benchmark result against the previous phase's
// stored baseline and fails (non-zero exit) on regression.
//
// Usage: node scripts/compare-benchmark.mjs <candidate.json> <baseline.json>
//
// Expected JSON shape (produced by `pnpm bench:phase`, built out during
// Phase 2 per docs/PHASED_PLAN.md — this is a starting contract, refine the
// producer script to match, don't silently change this shape without
// updating both sides):
//
// {
//   "phase": 3,
//   "passAt1": 0.42,          // fraction, 0-1
//   "costPerTaskUsd": 0.85,
//   "latencyP50Seconds": 41.2,
//   "taskCount": 10
// }
//
// Gate policy (tune as the project's actual tolerance becomes clear —
// these are deliberately conservative starting values, not settled science):
//   - passAt1 must not decrease at all vs. baseline.
//   - costPerTaskUsd must not increase by more than 20%.
//   - latencyP50Seconds must not increase by more than 30%.

import { readFileSync } from "node:fs";

const [, , candidatePath, baselinePath] = process.argv;

if (!candidatePath || !baselinePath) {
  console.error("Usage: compare-benchmark.mjs <candidate.json> <baseline.json>");
  process.exit(2);
}

function load(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    console.error(`Failed to read/parse ${path}: ${err.message}`);
    process.exit(2);
  }
}

const candidate = load(candidatePath);
const baseline = load(baselinePath);

const COST_TOLERANCE = 0.20;
const LATENCY_TOLERANCE = 0.30;

const failures = [];

if (candidate.passAt1 < baseline.passAt1) {
  failures.push(
    `pass@1 regressed: ${baseline.passAt1} -> ${candidate.passAt1}`
  );
}

// Relative tolerance around a zero baseline is undefined (0 * 1.2 == 0), so a
// phase whose predecessor was measured entirely on mock adapters (no real
// inference cost, ~0ms wall-clock) cannot produce a meaningful cost/latency
// regression check. When that happens the gate is skipped LOUDLY, not
// silently: pass@1 above stays the decision gate and the raw measured
// latencies remain visible in both files.
if (baseline.costPerTaskUsd > 0) {
  const costLimit = baseline.costPerTaskUsd * (1 + COST_TOLERANCE);
  if (candidate.costPerTaskUsd > costLimit) {
    failures.push(
      `cost/task regressed beyond ${COST_TOLERANCE * 100}% tolerance: ` +
        `${baseline.costPerTaskUsd} -> ${candidate.costPerTaskUsd} (limit ${costLimit.toFixed(4)})`
    );
  }
} else {
  console.warn(
    "WARN: baseline costPerTaskUsd is 0 (mock baseline) — cost regression check skipped."
  );
}

if (baseline.latencyP50Seconds > 0) {
  const latencyLimit = baseline.latencyP50Seconds * (1 + LATENCY_TOLERANCE);
  if (candidate.latencyP50Seconds > latencyLimit) {
    failures.push(
      `p50 latency regressed beyond ${LATENCY_TOLERANCE * 100}% tolerance: ` +
        `${baseline.latencyP50Seconds}s -> ${candidate.latencyP50Seconds}s (limit ${latencyLimit.toFixed(1)}s)`
    );
  }
} else {
  console.warn(
    "WARN: baseline latencyP50Seconds is 0 (mock baseline) — latency regression check skipped."
  );
}

console.log(`Comparing phase ${candidate.phase ?? "?"} candidate vs. baseline (phase ${baseline.phase ?? "?"}):`);
console.log(`  pass@1:      ${baseline.passAt1} -> ${candidate.passAt1}`);
console.log(`  cost/task:   $${baseline.costPerTaskUsd} -> $${candidate.costPerTaskUsd}`);
console.log(`  p50 latency: ${baseline.latencyP50Seconds}s -> ${candidate.latencyP50Seconds}s`);

if (failures.length > 0) {
  console.error("\nBENCHMARK REGRESSION — gate FAILS:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("\nNo regression beyond tolerance — gate PASSES.");
