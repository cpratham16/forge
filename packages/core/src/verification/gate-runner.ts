// Evidence-based completion gate (M6). The orchestrator asks this gate whether
// a run can be considered done. An agent's own claim of success never counts —
// completion is decided from VerificationResult evidence.
//
// A3: 'not_observed' (no evidence was produced) is neither a pass nor
// silently rendered as a fail — it surfaces as its own rejection reason.
import type { VerificationPort, VerificationResult } from '@runforge/contracts';

export interface VerificationGateResult {
  approved: boolean;
  result: VerificationResult;
  /** Why the gate did not approve, when it did not. */
  rejectionReason?: 'failed' | 'not_observed' | 'skipped';
}

export async function runVerificationGate(
  verifier: VerificationPort,
  task: unknown,
  output: unknown,
): Promise<VerificationGateResult> {
  const result = await verifier.verify(task, output);

  if (result.status === 'verified') {
    return { approved: true, result };
  }
  if (result.status === 'not_observed') {
    return { approved: false, result, rejectionReason: 'not_observed' };
  }
  if (result.status === 'failed') {
    return { approved: false, result, rejectionReason: 'failed' };
  }
  return { approved: false, result, rejectionReason: 'skipped' };
}

/**
 * A3: `not_observed` must never be silently rendered as a failure. This is the
 * single rendering path used by the loop and the CLI so the distinction is
 * preserved everywhere.
 */
export function describeVerificationStatus(status: VerificationResult['status']): string {
  switch (status) {
    case 'not_observed':
      return 'not observed';
    case 'verified':
      return 'verified';
    case 'failed':
      return 'failed';
    case 'skipped':
      return 'skipped';
  }
}