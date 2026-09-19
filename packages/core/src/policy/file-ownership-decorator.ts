import type { AgentSpec, ToolCall, ToolContext, ToolPort, ToolResult } from '@runforge/contracts';

export interface FileOwnershipDecoratorOptions {
  agents: AgentSpec[];
  currentAgent: string;
}

function matchesPattern(path: string, pattern: string): boolean {
  if (pattern === '**') {
    return true;
  }
  if (pattern.endsWith('**')) {
    const prefix = pattern.slice(0, -2);
    return path === prefix || path.startsWith(prefix);
  }
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return path.startsWith(prefix);
  }
  if (pattern.includes('*')) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(path);
  }
  return path === pattern || path.startsWith(pattern + '/');
}

function getAgentSpec(agents: AgentSpec[], name: string): AgentSpec | undefined {
  return agents.find((a) => a.name === name);
}

function extractTargetPath(call: ToolCall): string | null {
  if (call.name === 'shell') {
    return null;
  }
  if (call.name === 'read' || call.name === 'write' || call.name === 'edit' || call.name === 'delete') {
    return call.arguments.path as string | null;
  }
  if (call.name === 'git') {
    const args = call.arguments.args as string[] | undefined;
    return args?.[1] ?? null;
  }
  return null;
}

export class FileOwnershipToolDecorator implements ToolPort {
  constructor(
    private readonly inner: ToolPort,
    private readonly options: FileOwnershipDecoratorOptions,
  ) {}

  async execute(tool: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    const agentSpec = getAgentSpec(this.options.agents, this.options.currentAgent);
    if (!agentSpec) {
      return this.inner.execute(tool, ctx);
    }

    const targetPath = extractTargetPath(tool);
    if (!targetPath) {
      return this.inner.execute(tool, ctx);
    }

    const allowed = agentSpec.fileOwnership.some((pattern) => matchesPattern(targetPath, pattern));
    if (!allowed) {
      return {
        callId: tool.id,
        output: '',
        error: `Access denied: agent '${this.options.currentAgent}' cannot access '${targetPath}' (fileOwnership: ${agentSpec.fileOwnership.join(', ')})`,
        metadata: { denied: true, reason: 'file_ownership_violation' },
      };
    }

    return this.inner.execute(tool, ctx);
  }
}

export function createFileOwnershipDecorator(
  inner: ToolPort,
  options: FileOwnershipDecoratorOptions,
): ToolPort {
  return new FileOwnershipToolDecorator(inner, options);
}