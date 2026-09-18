// Phase 3 policy tests (PHASED_PLAN Phase 3: A1, A2, A4, A9 and the DENY-blocks test)
import { describe, it, expect, beforeEach } from 'vitest';
import type { ActionRequest, PolicyDecision, PolicyGrant, PolicyPort, ToolCall, ToolContext, ToolPort, ToolResult } from '@forge/contracts';
import { PolicyToolDecorator, defaultActionMapper } from '../src/policy/policy-tool-decorator.js';
import { DefaultPolicyPort } from '../src/policy/default-policy.js';
import { checkRuntimeFloor } from '../src/policy/runtime-floor.js';
import { isSecretFile, isProtectedFile, matchResource } from '../src/policy/util.js';

const ctx: ToolContext = { workspace: '.', permissions: { outcome: 'allow', rationale: 'test' } };

class SpyTool implements ToolPort {
  executed: ToolCall[] = [];
  async execute(call: ToolCall, _ctx: ToolContext): Promise<ToolResult> {
    this.executed.push(call);
    return { callId: call.id, output: 'ok' };
  }
}

class StaticPolicy implements PolicyPort {
  constructor(private readonly decision: Promise<PolicyDecision> | (() => Promise<PolicyDecision>)) {}

  async evaluate(_action: ActionRequest): Promise<PolicyDecision> {
    if (typeof this.decision === 'function') return this.decision();
    return this.decision;
  }
}

/** Policy that never resolves — used for the A1 timeout test. */
class HungPolicy implements PolicyPort {
  evaluate(_action: ActionRequest): Promise<PolicyDecision> {
    return new Promise<PolicyDecision>(() => {
      // never resolves
    });
  }
}

function gitCall(args: string[], id = 'c'): ToolCall {
  return { id, name: 'git', arguments: { args } };
}

function shellCall(command: string, id = 'c'): ToolCall {
  return { id, name: 'run_command', arguments: { command } };
}

describe('A1 — fail-closed policy evaluation', () => {
  it('denies when the policy throws, and the tool never executes', async () => {
    const spy = new SpyTool();
    const decorator = new PolicyToolDecorator(spy, {
      policy: new StaticPolicy(async () => {
        throw new Error('policy crashed');
      }),
    });

    const result = await decorator.execute(shellCall('echo hi'), ctx);

    expect(result.error).toContain('DENIED by policy');
    expect(result.metadata?.policyOutcome).toBe('deny');
    expect(spy.executed).toHaveLength(0);
  });

  it('denies when the policy times out, and the tool never executes', async () => {
    const spy = new SpyTool();
    const decorator = new PolicyToolDecorator(spy, {
      policy: new HungPolicy(),
      evaluationTimeoutMs: 50,
    });

    const result = await decorator.execute(shellCall('echo hi'), ctx);

    expect(result.error).toContain('fail-closed');
    expect(spy.executed).toHaveLength(0);
  });

  it('denies on a malformed PolicyDecision, and the tool never executes', async () => {
    const spy = new SpyTool();
    const decorator = new PolicyToolDecorator(spy, {
      policy: new StaticPolicy(Promise.resolve({ outcome: 'maybe', rationale: 42 } as unknown as PolicyDecision)),
    });

    const result = await decorator.execute(shellCall('echo hi'), ctx);

    expect(result.error).toContain('malformed-policy-decision');
    expect(spy.executed).toHaveLength(0);
  });
});

describe('A2 — RUNTIME_FLOOR is non-overridable', () => {
  const floorDeniedCalls: ToolCall[] = [
    gitCall(['commit', '-n', '-m', 'x'], 'c-verify-bypass'),
    gitCall(['commit', '--no-verify', '-m', 'x'], 'c-verify-bypass2'),
    gitCall(['reset', '--hard', 'HEAD'], 'c-reset'),
    gitCall(['push', '--force', 'origin', 'main'], 'c-force-push'),
    shellCall('git push -f origin main', 'c-force-push2'),
    shellCall('export AWS_KEY=AKIAIOSFODNN7EXAMPLE', 'c-secret'),
    { id: 'c-env', name: 'write_file', arguments: { path: 'config/.env', content: 'TOKEN=x' } },
    { id: 'c-pem', name: 'delete_file', arguments: { path: 'keys/id_rsa' } },
  ];

  it.each(floorDeniedCalls)('denies $id even when the configurable policy would allow it', async (call) => {
    const spy = new SpyTool();
    // This is the "forge.yaml attempts to permit" side of the test: the
    // configurable engine explicitly allows everything, and yet the floor wins.
    const permissive = new StaticPolicy(Promise.resolve({ outcome: 'allow', rationale: 'forge.yaml override' }));
    const decorator = new PolicyToolDecorator(spy, { policy: permissive });

    const result = await decorator.execute(call, ctx);

    expect(result.error).toContain('runtime-floor:');
    expect(spy.executed).toHaveLength(0);
  });

  it('denies floor actions even when a PolicyGrant would cover them', async () => {
    const spy = new SpyTool();
    const grant: PolicyGrant = {
      id: 'g1',
      grantee: 'agent',
      actionType: 'execute',
      resourcePattern: 'git *',
      expiresAt: Date.now() + 60_000,
      approvedBy: 'human',
      rationale: 'allow push --force for release',
    };
    const decorator = new PolicyToolDecorator(spy, {
      policy: new DefaultPolicyPort({ grants: [grant] }),
      mapAction: (call) => ({ ...defaultActionMapper(call, 'agent'), target: `git ${(call.arguments.args as string[]).join(' ')}` }),
    });

    const result = await decorator.execute(gitCall(['push', '--force', 'origin', 'main']), ctx);

    expect(result.error).toContain('runtime-floor:git.push.force');
    expect(spy.executed).toHaveLength(0);
  });

  it('exposes the floor as a pure check', () => {
    expect(checkRuntimeFloor({ type: 'execute', target: 'git commit -n', agent: 'a' })?.outcome).toBe('deny');
    expect(checkRuntimeFloor({ type: 'execute', target: 'git status', agent: 'a' })).toBeNull();
  });
});

describe('A4 — default policy matrix', () => {
  it('denies secrets in tool arguments', async () => {
    const action = defaultActionMapper(shellCall('echo AKIAIOSFODNN7EXAMPLE'), 'agent');
    expect(checkRuntimeFloor(action)?.outcome).toBe('deny');
  });

  it('denies verification bypass triggers', async () => {
    for (const args of [
      ['commit', '-n', '-m', 'x'],
      ['commit', '--no-verify', '-m', 'x'],
    ]) {
      expect(checkRuntimeFloor(defaultActionMapper(gitCall(args), 'agent'))?.rationale).toContain(
        'git.commit.verification-bypass',
      );
    }
  });

  it('denies destructive resets and force pushes', async () => {
    expect(checkRuntimeFloor(defaultActionMapper(gitCall(['reset', '--hard', 'HEAD']), 'agent'))?.rationale).toContain('git.reset.destructive');
    expect(checkRuntimeFloor(defaultActionMapper(gitCall(['push', '--force']), 'agent'))?.rationale).toContain('git.push.force');
  });

  it('denies .env and key material writes from the floor', async () => {
    expect(isSecretFile('.env')).toBe(true);
    expect(isSecretFile('.env.local')).toBe(true);
    expect(isSecretFile('secrets/prod.txt')).toBe(true);
    expect(isSecretFile('keys/id_ed25519')).toBe(true);
    expect(isSecretFile('src/index.ts')).toBe(false);
  });

  it('warns (approve tier) on protected-file edits', async () => {
    const policy = new DefaultPolicyPort();
    const decision = await policy.evaluate({ type: 'write', target: 'package.json', agent: 'agent' });
    expect(decision.outcome).toBe('approve');
    expect(decision.rationale).toContain('protected-file-edit');
    expect(isProtectedFile('.github/workflows/ci.yml')).toBe(true);
    expect(isProtectedFile('Dockerfile')).toBe(true);
  });

  it('denies delete and network by default, allows read/write/execute', async () => {
    const policy = new DefaultPolicyPort();
    expect((await policy.evaluate({ type: 'delete', target: 'notes.txt', agent: 'a' })).outcome).toBe('deny');
    expect((await policy.evaluate({ type: 'network', target: 'http://x', agent: 'a' })).outcome).toBe('deny');
    expect((await policy.evaluate({ type: 'read', target: 'a.txt', agent: 'a' })).outcome).toBe('allow');
    expect((await policy.evaluate({ type: 'write', target: 'a.txt', agent: 'a' })).outcome).toBe('allow');
    expect((await policy.evaluate({ type: 'execute', target: 'ls', agent: 'a' })).outcome).toBe('allow');
  });
});

describe('A9 — PolicyGrant scoped approvals', () => {
  let spy: SpyTool;
  let decorator: PolicyToolDecorator;

  beforeEach(() => {
    spy = new SpyTool();
    const grant: PolicyGrant = {
      id: 'g-delete-tmp',
      grantee: 'agent',
      actionType: 'delete',
      resourcePattern: 'tmp/*',
      expiresAt: Date.now() + 60_000,
      approvedBy: 'human',
      rationale: 'clean temp dir at plan time',
    };
    decorator = new PolicyToolDecorator(spy, {
      policy: new DefaultPolicyPort({ grants: [grant] }),
      mapAction: (call) => defaultActionMapper(call, 'agent'),
    });
  });

  it('allows a targeted delete covered by a valid grant', async () => {
    const result = await decorator.execute({ id: 'c', name: 'delete_file', arguments: { path: 'tmp/scratch.txt' } }, ctx);
    expect(result.error).toBeUndefined();
    expect(spy.executed).toHaveLength(1);
    expect(matchResource('tmp/*', 'tmp/scratch.txt')).toBe(true);
  });

  it('denies a delete outside the granted resource pattern', async () => {
    const result = await decorator.execute({ id: 'c', name: 'delete_file', arguments: { path: 'src/index.ts' } }, ctx);
    expect(result.error).toBeDefined();
    expect(spy.executed).toHaveLength(0);
  });

  it('denies when the grant is expired', async () => {
    const expiredGrant: PolicyGrant = {
      id: 'g-expired',
      grantee: 'agent',
      actionType: 'delete',
      resourcePattern: 'tmp/*',
      expiresAt: Date.now() - 1000,
      approvedBy: 'human',
      rationale: 'already gone',
    };
    const policy = new DefaultPolicyPort({ grants: [expiredGrant] });
    const decision = await policy.evaluate({ type: 'delete', target: 'tmp/x', agent: 'agent' });
    expect(decision.outcome).toBe('deny');
  });

  it('ignores grants addressed to another agent', async () => {
    const decision = await new DefaultPolicyPort({
      grants: [{ id: 'g', grantee: 'other-agent', actionType: 'delete', resourcePattern: 'tmp/*', approvedBy: 'h', rationale: 'x' }],
    }).evaluate({ type: 'delete', target: 'tmp/x', agent: 'agent' });
    expect(decision.outcome).toBe('deny');
  });
});

describe('DENY blocks execution', () => {
  it('does not invoke the underlying tool for an explicit deny decision', async () => {
    const spy = new SpyTool();
    const decorator = new PolicyToolDecorator(spy, {
      policy: new StaticPolicy(Promise.resolve({ outcome: 'deny', rationale: 'no' })),
    });

    const result = await decorator.execute({ id: 'c', name: 'read_file', arguments: { path: 'x' } }, ctx);

    expect(result.error).toContain('no');
    expect(spy.executed).toHaveLength(0);
  });

  it('allows when the decision is allow', async () => {
    const spy = new SpyTool();
    const decorator = new PolicyToolDecorator(spy, { policy: new DefaultPolicyPort() });

    const result = await decorator.execute({ id: 'c', name: 'read_file', arguments: { path: 'x' } }, ctx);

    expect(result.error).toBeUndefined();
    expect(spy.executed).toHaveLength(1);
  });
});