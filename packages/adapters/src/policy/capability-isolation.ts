// Capability Isolation — adapter-side wiring with real security weight
// (PHASED_PLAN Phase 7; packages/adapters/AGENTS.md: "the agent's execution
// environment must not have network access to the harness control plane").
//
// The actual boundary decision logic lives in @runforge/core (the non-overridable
// runtime floor). This module is where the concrete surface is sourced from
// the host environment so the boundary can be mounted guard-realistic values:
//   - FORGE_CONTROL_HOSTS  — comma-separated hostnames/addresses to protect
//   - FORGE_CONTROL_PORT   — the control interface port (default 4321)
//   - FORGE_CONTROL_PATHS  — comma-separated control-plane path prefixes
//
// Whatever env says, @runforge/core unions its compiled-in floor over top, so a
// misconfiguration or forge.yaml cannot remove the floor — it can only add
// more protected targets.
import { CapabilityIsolationToolDecorator, CONTROL_PLANE_FLOOR } from '@runforge/core';
import type { ControlPlaneSurface, ToolPort } from '@runforge/contracts';

export const FORGE_CONTROL_HOSTS_ENV = 'FORGE_CONTROL_HOSTS';
export const FORGE_CONTROL_PORT_ENV = 'FORGE_CONTROL_PORT';
export const FORGE_CONTROL_PATHS_ENV = 'FORGE_CONTROL_PATHS';

export interface CapabilityIsolationConfig {
  /** Explicit surface override. Floor still unions over it. */
  surface?: ControlPlaneSurface;
  /** Agent name stamped onto derived ActionRequests. */
  agent?: string;
}

export type EnvLike = Record<string, string | undefined>;

function listEnv(value: string | undefined): string[] {
  return (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Sources the control-plane surface from the environment. Values fall back to
 * the compiled-in floor so the real (unresolved) surface is never empty.
 */
export function controlPlaneSurfaceFromEnv(env: EnvLike = process.env): ControlPlaneSurface {
  const rawPort = Number(env[FORGE_CONTROL_PORT_ENV]);
  const port = Number.isFinite(rawPort) && rawPort > 0 && rawPort <= 65535 ? rawPort : undefined;
  const hosts = listEnv(env[FORGE_CONTROL_HOSTS_ENV]);
  const paths = listEnv(env[FORGE_CONTROL_PATHS_ENV]);

  return {
    controlHosts: hosts.length > 0 ? hosts : [...CONTROL_PLANE_FLOOR.controlHosts],
    controlPorts: port !== undefined ? [port] : [...CONTROL_PLANE_FLOOR.controlPorts],
    controlPaths: paths.length > 0 ? paths : [...CONTROL_PLANE_FLOOR.controlPaths],
  };
}

/**
 * Wraps a ToolPort behind the capability-isolation boundary, sourcing the
 * surface from the environment (or an explicit override). The core floor is
 * enforced regardless of either.
 */
export function createCapabilityIsolationDecorator(
  inner: ToolPort,
  config: CapabilityIsolationConfig = {},
  env: EnvLike = process.env,
): ToolPort {
  return new CapabilityIsolationToolDecorator(inner, {
    surface: config.surface ?? controlPlaneSurfaceFromEnv(env),
    ...(config.agent !== undefined ? { agent: config.agent } : {}),
  });
}