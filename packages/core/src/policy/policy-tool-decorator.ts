// PolicyToolDecorator — wraps any ToolPort behind fail-closed policy
// enforcement (PHASED_PLAN Phase 3 A1/A2/A9).
//
// Order of evaluation, hard guarantees:
//   1. RUNTIME_FLOOR is checked FIRST. A floor match denies and the tool never
//      executes, regardless of what any configurable policy (or forge.yaml)
//      says.
//   2. The configurable PolicyPort is evaluated with fail-closed semantics:
//      an exception, a timeout, or a malformed decision ALL resolve to deny
//      and the underlying tool NEVER executes (ADR-002).
//   3. A clean 'deny' outcome blocks execution. 'allow' and 'approve' proceed.
import type {
  ActionRequest,
  PolicyDecision,
  PolicyPort,
  ToolCall,
  ToolContext,
  ToolPort,
  ToolResult,
} from '@runforge/contracts';
import { checkRuntimeFloor } from './runtime-floor.js';

export interface PolicyToolDecoratorOptions {
  /** The configurable policy engine (default rules, grants, etc). */
  policy: PolicyPort;
  /** How long a policy evaluation may take before it is treated as failure. */
  evaluationTimeoutMs?: number;
  /** Agent name stamped onto derived ActionRequests (used for grants). */
  agent?: string;
  /** Custom tool-call → action mapper. Defaults to defaultActionMapper. */
  mapAction?: (call: ToolCall) => ActionRequest;
}

export const DEFAULT_EVALUATION_TIMEOUT_MS = 5000;

function strArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Derives a PolicyPort ActionRequest from a tool call produced by a model.
 * Reconstructs a command string for git/shell calls so the runtime floor and
 * rule engine can reason over the actual command line.
 */
export function defaultActionMapper(call: ToolCall, agent = 'agent'): ActionRequest {
  const args = call.arguments;
  const name = call.name.toLowerCase();

  if (name === 'git') {
    const parts = Array.isArray(args.args) ? args.args.map(String) : [];
    return { type: 'execute', target: `git ${parts.join(' ')}`, args, agent };
  }

  if (name.includes('shell') || name === 'run_command') {
    const command = strArg(args, 'command') ?? String(args.command ?? '');
    return { type: 'execute', target: command, args, agent };
  }

  if (name.includes('read') || name.includes('list') || name.includes('search') || name.includes('glob')) {
    return { type: 'read', target: strArg(args, 'path') ?? strArg(args, 'pattern') ?? call.name, args, agent };
  }

  if (name.includes('write') || name.includes('edit') || name.includes('patch')) {
    return { type: 'write', target: strArg(args, 'path') ?? call.name, args, agent };
  }

  if (name.includes('delete') || name.includes('remove') || name === 'rm') {
    return { type: 'delete', target: strArg(args, 'path') ?? call.name, args, agent };
  }

  return { type: 'execute', target: call.name, args, agent };
}

function isValidDecision(decision: unknown): decision is PolicyDecision {
  if (typeof decision !== 'object' || decision === null) return false;
  const candidate = decision as { outcome?: unknown; rationale?: unknown };
  return (
    (candidate.outcome === 'allow' || candidate.outcome === 'approve' || candidate.outcome === 'deny') &&
    typeof candidate.rationale === 'string'
  );
}

function blockedResult(callId: string, rationale: string): ToolResult {
  return {
    callId,
    output: '',
    error: `DENIED by policy: ${rationale}`,
    metadata: { policyOutcome: 'deny' },
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  if (ms <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(onTimeout()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

export class PolicyToolDecorator implements ToolPort {
  private readonly inner: ToolPort;
  private readonly policy: PolicyPort;
  private readonly evaluationTimeoutMs: number;
  private readonly agent: string;
  private readonly mapAction: (call: ToolCall) => ActionRequest;

  constructor(inner: ToolPort, options: PolicyToolDecoratorOptions) {
    this.inner = inner;
    this.policy = options.policy;
    this.evaluationTimeoutMs = options.evaluationTimeoutMs ?? DEFAULT_EVALUATION_TIMEOUT_MS;
    this.agent = options.agent ?? 'agent';
    this.mapAction = options.mapAction ?? ((call) => defaultActionMapper(call, this.agent));
  }

  async execute(tool: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    const action = this.mapAction(tool);

    const floor = checkRuntimeFloor(action);
    if (floor !== null) {
      return blockedResult(tool.id, floor.rationale);
    }

    let decision: PolicyDecision;
    try {
      decision = await withTimeout(
        this.policy.evaluate(action),
        this.evaluationTimeoutMs,
        () => new Error(`policy evaluation timed out after ${this.evaluationTimeoutMs}ms`),
      );
    } catch {
      return blockedResult(tool.id, 'policy-evaluation-failure — fail-closed: denied');
    }

    if (!isValidDecision(decision)) {
      return blockedResult(tool.id, 'malformed-policy-decision — fail-closed: denied');
    }

    if (decision.outcome === 'deny') {
      return blockedResult(tool.id, decision.rationale);
    }

    return this.inner.execute(tool, ctx);
  }
}