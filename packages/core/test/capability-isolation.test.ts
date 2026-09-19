// Capability isolation tests (PHASED_PLAN Phase 7):
// - a tool/model effort to reach the harness control interface is denied at
//   the boundary and never touches the inner tool port (or the policy engine)
// - fail-closed: exception, timeout, and malformed boundary decision all deny
// - non-overridable: a would-be config surface that empties the surface still
//   cannot remove the compiled-in floor
import { describe, it, expect, vi } from 'vitest';
import type { ActionRequest, PolicyDecision, ToolCall, ToolContext, ToolPort, ToolResult } from '@runforge/contracts';
import { CapabilityIsolationToolDecorator, evaluateCapabilityIsolation, resolveControlPlaneSurface } from '../src/policy/capability-isolation.js';
import { PolicyToolDecorator, type PolicyToolDecoratorOptions } from '../src/policy/policy-tool-decorator.js';

const ctx: ToolContext = {
  workspace: '.',
  permissions: { outcome: 'allow', rationale: 'test' },
};

function okResult(callId: string): ToolResult {
  return { callId, output: 'ok', metadata: { executedBy: 'spy' } };
}

function spyInner(): { inner: ToolPort; calls: ToolCall[] } {
  const calls: ToolCall[] = [];
  const inner: ToolPort = {
    async execute(tool: ToolCall): Promise<ToolResult> {
      calls.push(tool);
      return okResult(tool.id);
    },
  };
  return { inner, calls };
}

function call(name: string, arguments_: Record<string, unknown>, id = 'c1'): ToolCall {
  return { id, name, arguments: arguments_ };
}

describe('evaluateCapabilityIsolation', () => {
  it('denies network reach to the control interface (loopback:control-port)', () => {
    const decision = evaluateCapabilityIsolation({
      type: 'execute',
      target: 'curl http://127.0.0.1:4321/v1/control',
      agent: 'developer',
    });
    expect(decision).not.toBeNull();
    expect(decision?.outcome).toBe('deny');
    expect(decision?.rationale).toContain('4321');
  });

  it('denies network reach written as a bare host:port (nc form)', () => {
    const decision = evaluateCapabilityIsolation({
      type: 'network',
      target: 'nc localhost 4321',
      agent: 'developer',
    });
    expect(decision?.outcome).toBe('deny');
  });

  it('denies file reach into the control path (.forge/**)', () => {
    const decision = evaluateCapabilityIsolation({
      type: 'read',
      target: '.forge/traces/r-x.jsonl',
      agent: 'developer',
    });
    expect(decision?.outcome).toBe('deny');
    expect(decision?.rationale).toContain('.forge');
  });

  it('denies writes that would clobber control-plane state', () => {
    const decision = evaluateCapabilityIsolation({
      type: 'write',
      target: '.forge/proposals/new.json',
      agent: 'developer',
    });
    expect(decision?.outcome).toBe('deny');
  });

  it('returns null for normal in-scope work', () => {
    const decision = evaluateCapabilityIsolation({
      type: 'write',
      target: 'src/payment.ts',
      agent: 'developer',
    });
    expect(decision).toBeNull();
  });

  it('resolveControlPlaneSurface always contains the floor even for an empty config surface', () => {
    const resolved = resolveControlPlaneSurface({ controlHosts: [], controlPorts: [], controlPaths: [] });
    expect(resolved.controlHosts).toContain('127.0.0.1');
    expect(resolved.controlPorts).toContain(4321);
    expect(resolved.controlPaths).toContain('.forge');
  });

  it('resolveControlPlaneSurface unions configured targets without dropping floor entries', () => {
    const resolved = resolveControlPlaneSurface({ controlHosts: ['api.internal'], controlPorts: [9000], controlPaths: ['.forge-ci'] });
    expect(resolved.controlHosts).toEqual(expect.arrayContaining(['api.internal', '127.0.0.1']));
    expect(resolved.controlPorts).toEqual(expect.arrayContaining([9000, 4321]));
    expect(resolved.controlPaths).toEqual(expect.arrayContaining(['.forge-ci', '.forge']));
  });
});

describe('CapabilityIsolationToolDecorator', () => {
  it('denies a control-plane network attempt before the inner tool executes', async () => {
    const { inner, calls } = spyInner();
    const decorator = new CapabilityIsolationToolDecorator(inner);
    const result = await decorator.execute(call('run_command', { command: 'curl http://127.0.0.1:4321/x' }), ctx);

    expect(result.error).toContain('DENIED by capability isolation');
    expect(calls).toHaveLength(0);
  });

  it('denies a control-path read before the inner tool executes', async () => {
    const { inner, calls } = spyInner();
    const decorator = new CapabilityIsolationToolDecorator(inner);
    const result = await decorator.execute(call('read_file', { path: '.forge/traces/x.jsonl' }), ctx);

    expect(result.error).toContain('DENIED by capability isolation');
    expect(calls).toHaveLength(0);
  });

  it('denies BEFORE the configurable policy engine is consulted', async () => {
    const policy = { evaluate: vi.fn().mockResolvedValue({ outcome: 'allow', rationale: 'would have allowed' }) };
    const policyDecorator = new PolicyToolDecorator(spyInner().inner, { policy } as PolicyToolDecoratorOptions);
    const isolated = new CapabilityIsolationToolDecorator(policyDecorator);

    const result = await isolated.execute(call('run_command', { command: 'curl http://127.0.0.1:4321/x' }), ctx);

    expect(result.error).toContain('DENIED by capability isolation');
    expect(policy.evaluate).not.toHaveBeenCalled();
  });

  it('passes benign tool work through to the inner tool', async () => {
    const { inner, calls } = spyInner();
    const decorator = new CapabilityIsolationToolDecorator(inner);
    const result = await decorator.execute(call('edit_file', { path: 'src/payment.ts', search: 'a', replace: 'b' }), ctx);

    expect(result.error).toBeUndefined();
    expect(result.output).toBe('ok');
    expect(calls).toHaveLength(1);
  });

  it('is fail-closed when the boundary check throws', async () => {
    const { inner, calls } = spyInner();
    const decorator = new CapabilityIsolationToolDecorator(inner, {
      checkBoundary: () => {
        throw new Error('boom');
      },
    });

    const result = await decorator.execute(call('read_file', { path: 'src/payment.ts' }), ctx);
    expect(result.error).toContain('fail-closed: denied');
    expect(calls).toHaveLength(0);
  });

  it('is fail-closed when the boundary check times out', async () => {
    const { inner, calls } = spyInner();
    const decorator = new CapabilityIsolationToolDecorator(inner, {
      checkBoundary: () => new Promise<never>(() => {}),
      evaluationTimeoutMs: 5,
    });

    const result = await decorator.execute(call('read_file', { path: 'src/payment.ts' }), ctx);
    expect(result.error).toContain('fail-closed: denied');
    expect(calls).toHaveLength(0);
  });

  it('is fail-closed when the boundary check returns a malformed decision', async () => {
    const { inner, calls } = spyInner();
    const decorator = new CapabilityIsolationToolDecorator(inner, {
      checkBoundary: () => ({ outcome: 'maybe', rationale: 'x' }) as unknown as (action: ActionRequest) => Promise<PolicyDecision | null> | PolicyDecision | null,
    });

    const result = await decorator.execute(call('read_file', { path: 'src/payment.ts' }), ctx);
    expect(result.error).toContain('malformed-boundary-decision');
    expect(calls).toHaveLength(0);
  });

  it('cannot be weakened by an empty configured surface (non-overridable floor)', async () => {
    const { inner, calls } = spyInner();
    const decorator = new CapabilityIsolationToolDecorator(inner, {
      surface: { controlHosts: [], controlPorts: [], controlPaths: [] },
    });

    const network = await decorator.execute(call('run_command', { command: 'curl http://127.0.0.1:4321/x' }), ctx);
    expect(network.error).toContain('DENIED by capability isolation');

    const file = await decorator.execute(call('read_file', { path: '.forge/traces/x.jsonl' }), ctx);
    expect(file.error).toContain('DENIED by capability isolation');

    expect(calls).toHaveLength(0);
  });
});