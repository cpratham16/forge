#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Claims test (HARNESS_INSPIRATIONS.md item A13 — planned for Phase 0, built
 * here in the fix-known-gaps audit): machine-verify that README.md's status
 * line agrees with .opencode/STATE.md's current phase.
 *
 * This is deliberately a STARTING POINT, not an exhaustive README validator.
 * The one claim that has actually drifted so far is the phase status line
 * (the README said "Phase 6 in progress" while STATE.md was already Phase 7),
 * so that is the single claim we check. If another claim drifts later,
 * extend this script along the same evidence-based-completion principle the
 * rest of the repo runs on — a README claim that isn't machine-checked is a
 * claim that will rot.
 *
 * How it works:
 *   - Reads the `Phase` value out of STATE.md's `## Current` table.
 *   - Scans README.md for every `Phase <N>` occurrence and takes the largest.
 *   - Fails (non-zero exit) if the two disagree, or if README doesn't name a
 *     phase at all.
 *
 * Usage: node scripts/check-readme-claims.mjs  (also `pnpm check-claims`)
 */
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

const state = read('.opencode/STATE.md');
const readme = read('README.md');

const statePhase = parseStatePhase(state);
const readmePhase = parseReadmePhase(readme);

if (statePhase === null) {
  console.error(
    'FAIL: could not find a `| Phase |` row under `## Current` in .opencode/STATE.md.'
  );
  process.exit(1);
}

if (readmePhase === null) {
  console.error(
    `FAIL: README.md never names a phase (no \`Phase <N>\` in the status line). ` +
      `STATE.md's current phase is ${statePhase}. Update README's status line.`
  );
  process.exit(1);
}

if (readmePhase !== statePhase) {
  console.error(
    `FAIL: README claim drift — README.md's status line says Phase ${readmePhase}, ` +
      `but .opencode/STATE.md's current phase is ${statePhase}. ` +
      `This is the exact drift A13 exists to catch. Update README's status line ` +
      `(see "Fix the mechanism, not just the text" in the fix-known-gaps audit).`
  );
  process.exit(1);
}

console.log(`OK: README status line agrees with STATE.md (Phase ${statePhase}).`);
process.exit(0);

function parseStatePhase(text) {
  const current = text.slice(text.indexOf('## Current'));
  const row = current.match(/\|\s*Phase\s*\|\s*(\d+)/);
  if (!row) return null;
  return Number(row[1]);
}

function parseReadmePhase(text) {
  const matches = [...text.matchAll(/\bPhase\s+(\d+)\b/g)];
  if (matches.length === 0) return null;
  return Math.max(...matches.map((m) => Number(m[1])));
}