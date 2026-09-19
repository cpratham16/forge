// Capability Isolation — the runtime boundary that keeps the agent execution
// environment from reaching the harness control plane (PHASED_PLAN Phase 7,
// PRD §5 "capability isolation" + "non-overridable runtime floor", ADR-004).
//
// Hard guarantees, same tier as RUNTIME_FLOOR (see policy-tool-decorator.ts):
//   1. Outermost decorator: evaluated BEFORE the configurable policy engines.
//      A deny here never reaches the inner policy tool port.
//   2. Non-overridable: the floor surface is compiled into core and any
//      configured surface is a UNION over the floor, so configuration (e.g.
//      forge.yaml) can only ADD protected targets, never remove them.
//   3. Fail-closed: an exception, timeout, or malformed boundary decision ALL
//      resolve to deny and the tool never executes (ADR-002 semantics).
//
// Core is pure: this is string/pattern logic over ActionRequests only. The
// network-level enforcement that builds the actual surface from the host
// environment lives in @forge/adapters (packages/adapters/src/policy/).
import type {
  ActionRequest,
  ControlPlaneSurface,
  PolicyDecision,
  ToolCall,
  ToolContext,
  ToolPort,
  ToolResult,
} from '@forge/contracts';
import { actionText } from './util.js';
import { defaultActionMapper } from './policy-tool-decorator.js';

/** Default port the harness control interface listens on (loopback only).
 * Overridable by the adapter's surface via FORGE_CONTROL_PORT. */
export const DEFAULT_CONTROL_PORT = 4321;

/** Compiled-in floor — cannot be emptied or disabled by configuration. */
export const CONTROL_PLANE_FLOOR: ControlPlaneSurface = {
  controlHosts: ['localhost', '127.0.0.1', '[::1]'],
  controlPorts: [DEFAULT_CONTROL_PORT],
  controlPaths: ['.forge'],
};

/**
 * Unions a configured surface over the floor. Configured values may only ADD
 * hosts/ports/paths; floor entries are always present. Passing an empty
 * surface (e.g. from a would-be forge.yaml "disable isolation" block) changes
 * nothing because the floor is still enforced.
 */
export function resolveControlPlaneSurface(configured?: ControlPlaneSurface): ControlPlaneSurface {
  return {
    controlHosts: Array.from(new Set([...CONTROL_PLANE_FLOOR.controlHosts, ...(configured?.controlHosts ?? [])])),
    controlPorts: Array.from(new Set([...CONTROL_PLANE_FLOOR.controlPorts, ...(configured?.controlPorts ?? [])])),
    controlPaths: Array.from(new Set([...CONTROL_PLANE_FLOOR.controlPaths, ...(configured?.controlPaths ?? [])])),
  };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Adjacency match: host immediately followed by `:`, `/`, or whitespace,
 * then a control port. Colon/slash cover URL forms (`http://localhost:4321`);
 * whitespace covers command forms (`nc localhost 4321`, `curl 127.0.0.1 4321`). */
function reachesControlHostPort(text: string, surface: ControlPlaneSurface): string | undefined {
  for (const host of surface.controlHosts) {
    for (const port of surface.controlPorts) {
      if (new RegExp(`${escapeRegExp(host)}\\s*[:/]\\s*${port}\\b`).test(text)) {
        return `${host}:${port}`;
      }
      if (new RegExp(`${escapeRegExp(host)}\\s+${port}\\b`).test(text)) {
        return `${host}:${port}`;
      }
    }
  }
  return undefined;
}

/** Path-segment match: a control path present as its own path segment. */
function reachesControlPath(text: string, surface: ControlPlaneSurface): string | undefined {
  for (const path of surface.controlPaths) {
    if (new RegExp(`(^|[\\\\/])${escapeRegExp(path)}([\\\\/]|$|\\s)`).test(text)) {
      return path;
    }
  }
  return undefined;
}

/**
 * Evaluates whether an action reaches the harness control plane.
 * Returns a deny PolicyDecision when it does, null when it does not.
 */
export function evaluateCapabilityIsolation(action: ActionRequest, surface?: ControlPlaneSurface): PolicyDecision | null {
  const resolved = resolveControlPlaneSurface(surface);
  const text = actionText(action);

  const endpoint = reachesControlHostPort(text, resolved);
  if (endpoint) {
    return {
      outcome: 'deny',
      rationale: `capability-isolation: action reaches the harness control interface (${endpoint}) — denied at the runtime boundary`,
    };
  }

  const path = reachesControlPath(text, resolved);
  if (path) {
    return {
      outcome: 'deny',
      rationale: `capability-isolation: action reaches the harness control path (${path}/**) — denied at the runtime boundary`,
    };
  }

  return null;
}

export interface CapabilityIsolationToolDecoratorOptions {
  /** Configured surface. Always unioned over CONTROL_PLANE_FLOOR. */
  surface?: ControlPlaneSurface;
  /** Agent name stamped onto derived ActionRequests. */
  agent?: string;
  /** Custom tool-call → action mapper. Defaults to defaultActionMapper. */
  mapAction?: (call: ToolCall) => ActionRequest;
  /**
   * Injectable boundary check for testing fail-closed semantics.
   * Defaults to evaluateCapabilityIsolation against the resolved surface.
   */
  checkBoundary?: (action: ActionRequest) => PolicyDecision | null | Promise<PolicyDecision | null>;
  /** How long a boundary evaluation may take before it is treated as failure. */
  evaluationTimeoutMs?: number;
}

export const DEFAULT_ISOLATION_EVALUATION_TIMEOUT_MS = 5000;

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
    error: `DENIED by capability isolation: ${rationale}`,
    metadata: { policyOutcome: 'deny', isolationBoundary: true },
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

/**
 * Wraps a ToolPort behind the capability-isolation boundary. As the outermost
 * decorator it runs BEFORE any configurable policy engine: an isolation deny
 * means the inner tool port (and therefore the configurable policy) never
 * sees the action at all.
 */
export class CapabilityIsolationToolDecorator implements ToolPort {
  private readonly inner: ToolPort;
  private readonly surface: ControlPlaneSurface;
  private readonly agent: string;
  private readonly mapAction: (call: ToolCall) => ActionRequest;
  private readonly checkBoundary: (action: ActionRequest) => PolicyDecision | null | Promise<PolicyDecision | null>;
  private readonly evaluationTimeoutMs: number;

  constructor(inner: ToolPort, options: CapabilityIsolationToolDecoratorOptions = {}) {
    this.inner = inner;
    this.surface = options.surface ?? resolveControlPlaneSurface();
    this.agent = options.agent ?? 'agent';
    this.mapAction = options.mapAction ?? ((call) => defaultActionMapper(call, this.agent));
    this.checkBoundary = options.checkBoundary ?? ((action) => evaluateCapabilityIsolation(action, this.surface));
    this.evaluationTimeoutMs = options.evaluationTimeoutMs ?? DEFAULT_ISOLATION_EVALUATION_TIMEOUT_MS;
  }

  async execute(tool: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    const action = this.mapAction(tool);

    let decision: PolicyDecision | null;
    try {
      decision = await withTimeout(
        Promise.resolve(this.checkBoundary(action)),
        this.evaluationTimeoutMs,
        () => new Error(`capability isolation evaluation timed out after ${this.evaluationTimeoutMs}ms`),
      );
    } catch {
      return blockedResult(tool.id, 'capability-isolation-evaluation-failure — fail-closed: denied');
    }

    if (decision !== null && !isValidDecision(decision)) {
      return blockedResult(tool.id, 'malformed-boundary-decision — fail-closed: denied');
    }

    if (decision !== null && decision.outcome === 'deny') {
      return blockedResult(tool.id, decision.rationale);
    }

    return this.inner.execute(tool, ctx);
  }
}