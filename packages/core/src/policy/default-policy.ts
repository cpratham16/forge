// Default policy engine (A4). Modeled on the CCH matrix:
//   - verify secrets / verification bypass / destructive resets against the
//     RUNTIME_FLOOR first (handled by PolicyToolDecorator, not here)
//   - warn/confirm on protected-file edits (package.json, workflows, Dockerfile…)
//   - deny-by-default for delete and network actions
//   - PolicyGrant (A9): scoped, time-boxed approvals that permit a targeted
//     action (e.g. one delete path) without weakening the runtime floor.
import type { ActionRequest, PolicyDecision, PolicyGrant, PolicyPort } from '@runforge/contracts';
import { isProtectedFile, matchResource } from './util.js';

export interface DefaultPolicyOptions {
  /** Scoped, plan-time approvals evaluated before default rules. */
  grants?: PolicyGrant[];
  /** When true, edits to sensitive files produce 'approve' (confirm tier). */
  warnOnProtectedEdits?: boolean;
}

interface Rule {
  id: string;
  description: string;
  matches(action: ActionRequest): boolean;
  outcome: 'approve' | 'deny';
}

export class DefaultPolicyPort implements PolicyPort {
  private readonly grants: PolicyGrant[];
  private readonly rules: Rule[];

  constructor(private readonly options: DefaultPolicyOptions = {}) {
    this.grants = options.grants ?? [];

    const rules: Rule[] = [];
    if (options.warnOnProtectedEdits !== false) {
      rules.push({
        id: 'protected-file-edit',
        description: 'edits to package manifests, CI workflows, and config are sensitive — confirm first.',
        matches: (a) => a.type === 'write' && isProtectedFile(a.target),
        outcome: 'approve',
      });
    }
    this.rules = rules;
  }

  async evaluate(action: ActionRequest): Promise<PolicyDecision> {
    const grant = this.matchingGrant(action);
    if (grant) {
      return {
        outcome: 'allow',
        rationale: `grant:${grant.id} — ${grant.rationale}`,
      };
    }

    for (const rule of this.rules) {
      if (rule.matches(action)) {
        return { outcome: rule.outcome, rationale: `rule:${rule.id} — ${rule.description}` };
      }
    }

    switch (action.type) {
      case 'read':
        return { outcome: 'allow', rationale: 'default-allow-read' };
      case 'write':
        return { outcome: 'allow', rationale: 'default-allow-write' };
      case 'execute':
        return { outcome: 'allow', rationale: 'default-allow-execute' };
      case 'delete':
        return { outcome: 'deny', rationale: 'default-deny-delete — requires a scoped PolicyGrant' };
      case 'network':
        return { outcome: 'deny', rationale: 'default-deny-network — requires a scoped PolicyGrant' };
    }
  }

  private matchingGrant(action: ActionRequest): PolicyGrant | undefined {
    for (const grant of this.grants) {
      if (grant.grantee !== action.agent) continue;
      if (grant.actionType !== action.type) continue;
      if (grant.expiresAt !== undefined && grant.expiresAt <= Date.now()) continue;
      if (!matchResource(grant.resourcePattern, action.target)) continue;
      return grant;
    }
    return undefined;
  }
}