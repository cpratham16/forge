import { describe, it, expect } from 'vitest';
import { createFileOwnershipDecorator } from '../src/policy/file-ownership-decorator.js';
import type { ToolPort, ToolCall, ToolResult, ToolContext, AgentSpec } from '@forge/contracts';

const agents: AgentSpec[] = [
  { name: 'developer', capabilities: ['coding'], costTier: 'balanced', fileOwnership: ['src/**', 'tests/**'] },
  { name: 'reviewer', capabilities: ['review'], costTier: 'balanced', fileOwnership: ['**'] },
];

class MockToolPort implements ToolPort {
  public lastCall: ToolCall | null = null;
  public lastContext: ToolContext | null = null;

  constructor(private readonly result: ToolResult) {}

  async execute(tool: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    this.lastCall = tool;
    this.lastContext = ctx;
    return this.result;
  }
}

describe('FileOwnershipToolDecorator', () => {
  it('allows access when file matches agent ownership pattern', async () => {
    const inner = new MockToolPort({ callId: '1', output: 'file content' });
    const decorator = createFileOwnershipDecorator(inner, { agents, currentAgent: 'developer' });

    const result = await decorator.execute(
      { id: '1', name: 'read', arguments: { path: 'src/auth.ts' } },
      { workspace: '.', permissions: { outcome: 'allow', rationale: 'test' } },
    );

    expect(result.error).toBeUndefined();
    expect(inner.lastCall?.arguments.path).toBe('src/auth.ts');
  });

  it('allows access when agent has full ownership (**)', async () => {
    const inner = new MockToolPort({ callId: '1', output: 'file content' });
    const decorator = createFileOwnershipDecorator(inner, { agents, currentAgent: 'reviewer' });

    const result = await decorator.execute(
      { id: '1', name: 'write', arguments: { path: 'any/file.ts', content: 'x' } },
      { workspace: '.', permissions: { outcome: 'allow', rationale: 'test' } },
    );

    expect(result.error).toBeUndefined();
  });

  it('denies access when file does not match ownership', async () => {
    const inner = new MockToolPort({ callId: '1', output: 'file content' });
    const decorator = createFileOwnershipDecorator(inner, { agents, currentAgent: 'developer' });

    const result = await decorator.execute(
      { id: '1', name: 'read', arguments: { path: 'docs/secret.md' } },
      { workspace: '.', permissions: { outcome: 'allow', rationale: 'test' } },
    );

    expect(result.error).toContain('Access denied');
    expect(result.metadata?.denied).toBe(true);
    expect(result.metadata?.reason).toBe('file_ownership_violation');
    expect(inner.lastCall).toBeNull();
  });

  it('denies write to files outside ownership', async () => {
    const inner = new MockToolPort({ callId: '1', output: 'ok' });
    const decorator = createFileOwnershipDecorator(inner, { agents, currentAgent: 'developer' });

    const result = await decorator.execute(
      { id: '1', name: 'write', arguments: { path: 'config/production.json', content: '{}' } },
      { workspace: '.', permissions: { outcome: 'allow', rationale: 'test' } },
    );

    expect(result.error).toContain('Access denied');
  });

  it('denies edit to files outside ownership', async () => {
    const inner = new MockToolPort({ callId: '1', output: 'ok' });
    const decorator = createFileOwnershipDecorator(inner, { agents, currentAgent: 'developer' });

    const result = await decorator.execute(
      { id: '1', name: 'edit', arguments: { path: 'docs/guide.md', oldText: 'x', newText: 'y' } },
      { workspace: '.', permissions: { outcome: 'allow', rationale: 'test' } },
    );

    expect(result.error).toContain('Access denied');
  });

  it('denies delete to files outside ownership', async () => {
    const inner = new MockToolPort({ callId: '1', output: 'ok' });
    const decorator = createFileOwnershipDecorator(inner, { agents, currentAgent: 'developer' });

    const result = await decorator.execute(
      { id: '1', name: 'delete', arguments: { path: 'legacy/old.js' } },
      { workspace: '.', permissions: { outcome: 'allow', rationale: 'test' } },
    );

    expect(result.error).toContain('Access denied');
  });

  it('allows shell commands (no path restriction by default)', async () => {
    const inner = new MockToolPort({ callId: '1', output: 'command output' });
    const decorator = createFileOwnershipDecorator(inner, { agents, currentAgent: 'developer' });

    const result = await decorator.execute(
      { id: '1', name: 'shell', arguments: { command: 'ls -la' } },
      { workspace: '.', permissions: { outcome: 'allow', rationale: 'test' } },
    );

    expect(result.error).toBeUndefined();
  });

  it('returns inner result when agent not found', async () => {
    const inner = new MockToolPort({ callId: '1', output: 'file content' });
    const decorator = createFileOwnershipDecorator(inner, { agents, currentAgent: 'unknown-agent' });

    const result = await decorator.execute(
      { id: '1', name: 'read', arguments: { path: 'any/path' } },
      { workspace: '.', permissions: { outcome: 'allow', rationale: 'test' } },
    );

    expect(result.error).toBeUndefined();
    expect(inner.lastCall?.arguments.path).toBe('any/path');
  });

  it('matches wildcard patterns correctly', async () => {
    const inner = new MockToolPort({ callId: '1', output: 'file content' });
    const decorator = createFileOwnershipDecorator(inner, { agents, currentAgent: 'developer' });

    const result = await decorator.execute(
      { id: '1', name: 'read', arguments: { path: 'src/nested/deep/file.ts' } },
      { workspace: '.', permissions: { outcome: 'allow', rationale: 'test' } },
    );

    expect(result.error).toBeUndefined();
  });
});