// Capability isolation adapter contract tests (PHASED_PLAN Phase 7):
// the adapter-mounted decorator denies control-plane reach, honors the
// FORGE_* environment surface sourcing, and passes benign work through.
// The compiled-in floor keeps applying even when env is empty/absent.
import { describe, it, expect } from 'vitest';
import type { ToolCall, ToolContext, ToolPort, ToolResult } from '@forge/contracts';
import { CONTROL_PLANE_FLOOR, DEFAULT_CONTROL_PORT } from '@forge/core';
import {
  createCapabilityIsolationDecorator,
  controlPlaneSurfaceFromEnv,
  FORGE_CONTROL_HOSTS_ENV,
  FORGE_CONTROL_PORT_ENV,
  FORGE_CONTROL_PATHS_ENV,
} from '../../src/policy/capability-isolation.js';

const ctx: ToolContext = {
  workspace: '.',
  permissions: { outcome: 'allow', rationale: 'test' },
};

function okCall(name: string, arguments_: Record<string, unknown>): ToolCall {
  return { id: 'c1', name, arguments: arguments_ };
}

function passThrough(): { tool: ToolPort; count: { value: number } } {
  const count = { value: 0 };
  const tool: ToolPort = {
    async execute(call: ToolCall): Promise<ToolResult> {
      count.value++;
      return { callId: call.id, output: 'ok' };
    },
  };
  return { tool, count };
}

describe('capability isolation adapter', () => {
  it('denies control-interface reach with the default env-derived surface', async () => {
    const { tool, count: executed } = passThrough();
    const decorator = createCapabilityIsolationDecorator(tool, {}, {});

    const result = await decorator.execute(okCall('run_command', { command: 'curl http://127.0.0.1:4321/x' }), ctx);
    expect(result.error).toContain('DENIED by capability isolation');
    expect(executed.value).toBe(0);
  });

  it('denies control-plane path reach via the mounted decorator', async () => {
    const { tool, count: executed } = passThrough();
    const decorator = createCapabilityIsolationDecorator(tool, {}, {});

    const result = await decorator.execute(okCall('read_file', { path: '.forge/traces/x.jsonl' }), ctx);
    expect(result.error).toContain('DENIED by capability isolation');
    expect(executed.value).toBe(0);
  });

  it('honors FORGE_CONTROL_PORT when sourcing the surface from env', async () => {
    const surface = controlPlaneSurfaceFromEnv({ [FORGE_CONTROL_PORT_ENV]: '9999' });
    expect(surface.controlPorts).toContain(9999);
  });

  it('honors FORGE_CONTROL_HOSTS / FORGE_CONTROL_PATHS when sourcing the surface from env', async () => {
    const surface = controlPlaneSurfaceFromEnv({
      [FORGE_CONTROL_HOSTS_ENV]: 'control.internal, 10.0.0.5',
      [FORGE_CONTROL_PATHS_ENV]: '.forge-nightly, .forge-recording',
    });
    expect(surface.controlHosts).toEqual(['control.internal', '10.0.0.5']);
    expect(surface.controlPaths).toEqual(['.forge-nightly', '.forge-recording']);
  });

  it('still enforces the compiled-in floor when env overrides remove the defaults', async () => {
    const { tool, count: executed } = passThrough();
    const surface = controlPlaneSurfaceFromEnv({
      [FORGE_CONTROL_PORT_ENV]: '9999',
      [FORGE_CONTROL_PATHS_ENV]: '.forge-ci',
    });
    const decorator = createCapabilityIsolationDecorator(tool, { surface }, {});

    // 4321 is the floor port — env moved FORGE_CONTROL_PORT away but the floor stays.
    const url = await decorator.execute(okCall('run_command', { command: 'curl http://127.0.0.1:4321/x' }), ctx);
    expect(url.error).toContain('DENIED by capability isolation');

    // Base .forge path is the floor path — env added .forge-ci but .forge stays.
    const path = await decorator.execute(okCall('read_file', { path: '.forge/traces/x.jsonl' }), ctx);
    expect(path.error).toContain('DENIED by capability isolation');

    expect(executed.value).toBe(0);
  });

  it('passes benign in-workspace work through unchanged', async () => {
    const { tool, count: executed } = passThrough();
    const decorator = createCapabilityIsolationDecorator(tool, {}, {});

    const result = await decorator.execute(okCall('edit_file', { path: 'src/payment.ts', search: 'a', replace: 'b' }), ctx);
    expect(result.error).toBeUndefined();
    expect(executed.value).toBe(1);
  });

  it('exposes the floor constants used by the adapter surface', () => {
    expect(CONTROL_PLANE_FLOOR.controlPorts).toContain(DEFAULT_CONTROL_PORT);
    expect(CONTROL_PLANE_FLOOR.controlPaths).toContain('.forge');
  });
});