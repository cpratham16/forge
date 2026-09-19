// RUNTIME_FLOOR — the non-overridable security floor (ADR-002, PHASED_PLAN A2).
// Compiled into core, evaluated by PolicyToolDecorator BEFORE any configurable
// policy engine. forge.yaml (or any other configuration source) can never
// override, disable, or widen these rules — ignore the floor entirely and
// fail closed instead.
//
// Modeled on the CCH deny matrix (PHASED_PLAN Phase 3, A4): verification
// bypass, destructive resets, force pushes, and secret material are
// unconditionally denied.
import type { ActionRequest, PolicyDecision } from '@runforge/contracts';
import {
  commandText,
  containsSecret,
  hasToken,
  isGitCommand,
  isSecretFile,
} from './util.js';

export interface RuntimeFloorRule {
  id: string;
  description: string;
  matches(action: ActionRequest): boolean;
}

export const RUNTIME_FLOOR: readonly RuntimeFloorRule[] = [
  {
    id: 'git.commit.verification-bypass',
    description: 'git commit with --no-verify / -n skips the verification gate and is never allowed.',
    matches: (a) =>
      a.type === 'execute' &&
      isGitCommand(commandText(a)) &&
      hasToken(commandText(a), 'commit') &&
      (hasToken(commandText(a), '--no-verify') ||
        hasToken(commandText(a), '-n') ||
        commandText(a).includes('--no-verify=')),
  },
  {
    id: 'git.reset.destructive',
    description: 'destructive git reset (--hard / --force) destroys evidence-relevant work.',
    matches: (a) =>
      a.type === 'execute' &&
      isGitCommand(commandText(a)) &&
      hasToken(commandText(a), 'reset') &&
      (hasToken(commandText(a), '--hard') || hasToken(commandText(a), '--force')),
  },
  {
    id: 'git.push.force',
    description: 'force push rewrites shared history and is never allowed.',
    matches: (a) =>
      a.type === 'execute' &&
      isGitCommand(commandText(a)) &&
      hasToken(commandText(a), 'push') &&
      (hasToken(commandText(a), '--force') || hasToken(commandText(a), '-f')),
  },
  {
    id: 'secret-environment-files',
    description: '.env, .pem, .key material is never written, executed, or deleted.',
    matches: (a) =>
      (a.type === 'write' || a.type === 'delete' || a.type === 'execute') &&
      isSecretFile(a.target),
  },
  {
    id: 'secrets.in-content',
    description: 'known credential patterns must never enter tool arguments.',
    matches: (a) => containsSecret(a),
  },
];

/**
 * Returns a DENY decision if the action trips the runtime floor, otherwise null.
 * The decorator treats a non-null result as an unconditional block.
 */
export function checkRuntimeFloor(action: ActionRequest): PolicyDecision | null {
  for (const rule of RUNTIME_FLOOR) {
    if (rule.matches(action)) {
      return { outcome: 'deny', rationale: `runtime-floor:${rule.id} — ${rule.description}` };
    }
  }
  return null;
}