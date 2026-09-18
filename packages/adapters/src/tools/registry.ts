// ToolRegistry — composition-time dispatcher. Maps concrete tool names (as
// the model addresses them) to the family that implements them, and exposes
// the flattened ToolDefinition list for the model request.
import type { ToolCall, ToolContext, ToolDefinition, ToolPort, ToolResult } from '@forge/contracts';
import type { ToolFamily } from './types.js';

export class ToolRegistry implements ToolPort {
  private readonly dispatch = new Map<string, ToolPort>();
  private readonly definitions: ToolDefinition[];

  constructor(families: ToolFamily[]) {
    this.definitions = families.flatMap((family) => family.tools);
    const seen = new Set<string>();
    for (const family of families) {
      for (const tool of family.tools) {
        if (seen.has(tool.name)) {
          throw new Error(`ToolRegistry: duplicate tool name "${tool.name}"`);
        }
        seen.add(tool.name);
        this.dispatch.set(tool.name, family);
      }
    }
  }

  toolDefinitions(): ToolDefinition[] {
    return [...this.definitions];
  }

  has(name: string): boolean {
    return this.dispatch.has(name);
  }

  async execute(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    const port = this.dispatch.get(call.name);
    if (!port) {
      return { callId: call.id, output: '', error: `Unknown tool: ${call.name}` };
    }
    return port.execute(call, ctx);
  }
}