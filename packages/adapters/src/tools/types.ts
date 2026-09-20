// Tool family contract used at the composition root. A family is one
// adapter that implements ToolPort and declares the concrete tools it serves.
import type { ToolDefinition, ToolPort } from '@runforge/contracts';

export interface ToolFamily extends ToolPort {
  /** Family name, e.g. 'filesystem'. */
  readonly family: string;
  /** One ToolDefinition per tool name this family dispatches. */
  readonly tools: ToolDefinition[];
}