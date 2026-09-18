export { MockModelProvider } from './model/mock.js';
export type { MockModelProviderOptions } from './model/mock.js';

export { ClaudeModelProvider } from './model/claude.js';
export type { ClaudeModelProviderOptions } from './model/claude.js';

export { OpenAICompatibleModelProvider } from './model/openai-compatible.js';
export type { OpenAICompatibleOptions } from './model/openai-compatible.js';

export { FilesystemTool } from './tools/filesystem.js';
export { ShellTool } from './tools/shell.js';
export { GitTool } from './tools/git.js';
export { SearchTool } from './tools/search.js';
export { ToolRegistry } from './tools/registry.js';
export type { ToolFamily } from './tools/types.js';

export { ShellCommandVerifier } from './verification/shell-command.js';
export type { ShellCommandVerifierOptions, VerifierCommand } from './verification/shell-command.js';

export { FilesystemContextAdapter } from './context/filesystem-schema.js';
export type { FilesystemContextOptions } from './context/filesystem-schema.js';

export { JsonlTraceSink, loadTraceEvents, loadRun, listRunIds, getRunId, DEFAULT_TRACE_DIR } from './trace/jsonl.js';
export type { JsonlTraceSinkOptions, RunSummary } from './trace/jsonl.js';