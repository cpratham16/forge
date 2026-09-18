// @forge/contracts — zero dependencies, pure types only.
// NO imports from other .ts files — this file is the single source of truth.
// All types are defined inline here so that dependency-cruiser sees zero imports.

// ----- ModelProvider port -----
export interface ModelRequest {
  messages: Message[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  metadata?: Record<string, unknown>;
}

export interface ModelResponse {
  content: string;
  toolCalls?: ToolCall[];
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ModelProvider {
  complete(input: ModelRequest): Promise<ModelResponse>;
}

// ----- ToolPort -----
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolContext {
  workspace: string;
  permissions: PolicyDecision;
  signal?: AbortSignal;
}

export interface ToolResult {
  callId: string;
  output: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface PolicyDecision {
  outcome: 'allow' | 'approve' | 'deny';
  rationale: string;
}

export interface ToolPort {
  execute(tool: ToolCall, ctx: ToolContext): Promise<ToolResult>;
}

// ----- VerificationPort -----
export interface VerificationResult {
  taskId: string;
  status: 'verified' | 'failed' | 'skipped';
  evidence: Evidence[];
  timestamp: number;
}

export interface Evidence {
  type:
    | 'build_passed'
    | 'test_passed'
    | 'lint_passed'
    | 'dependency_check_passed'
    | 'benchmark_result'
    | 'manual_review';
  detail: string;
  command?: string;
  timestamp: number;
}

export interface VerificationPort {
  verify(task: unknown, output: unknown): Promise<VerificationResult>;
}

// ----- ContextPort -----
export interface ContextPack {
  taskId: string;
  files: FileContext[];
  symbols: SymbolContext[];
  history: GitContext[];
  rules: RuleContext[];
  previousFindings: FindingContext[];
  tokenBudget: number;
  tokensUsed: number;
}

export interface FileContext {
  path: string;
  content: string;
  relevanceScore: number;
}

export interface SymbolContext {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'variable';
  filePath: string;
  signature?: string;
}

export interface GitContext {
  commitSha: string;
  message: string;
  filesChanged: string[];
  timestamp: number;
}

export interface RuleContext {
  source: string;
  rule: string;
}

export interface FindingContext {
  fromAgent: string;
  summary: string;
  relatedFiles?: string[];
}

export interface ContextSpec {
  description: string;
  files?: string[];
}

export interface Criterion {
  description: string;
  verifiable: boolean;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffSeconds: number;
}

export interface ModelPolicy {
  preferred?: string;
  fallback?: string[];
  maxCostUsd?: number;
}

export interface ContextPort {
  build(task: unknown, repo: unknown): Promise<ContextPack>;
}

// ----- TracePort -----
export type TraceEventType =
  | 'context.selected'
  | 'model.request'
  | 'model.response'
  | 'tool.call'
  | 'tool.result'
  | 'state.transition'
  | 'agent.message'
  | 'verification.result'
  | 'orchestration.decision'
  | 'run.outcome';

export interface TraceEvent {
  id: string;
  parentId?: string;
  timestamp: number;
  type: TraceEventType;
  agent: string;
  payload: Record<string, unknown>;
}

export interface TracePort {
  record(event: TraceEvent): void;
  flush(): Promise<void>;
}

// ----- PolicyPort -----
export interface ActionRequest {
  type: 'read' | 'write' | 'execute' | 'network' | 'delete';
  target: string;
  args?: Record<string, unknown>;
  agent: string;
}

export interface PolicyPort {
  evaluate(action: ActionRequest): Promise<PolicyDecision>;
}

// ----- SubAgentRouter -----
export interface AgentSpec {
  name: string;
  capabilities: string[];
  costTier: 'fast' | 'balanced' | 'reasoning';
}

export interface AgentSelection {
  agent: string;
  rationale: string;
  confidence: number; // 0-1
}

export interface SubAgentRouter {
  route(task: unknown, agents: AgentSpec[]): Promise<AgentSelection>;
}

// ----- Domain types used by Task -----
export interface Task {
  id: string;
  objective: string;
  inputs: ContextSpec;
  successCriteria: Criterion[];
  retryPolicy: RetryPolicy;
  modelPolicy: ModelPolicy;
  dependencies: string[];
}

export interface AgentMessage {
  from: string;
  to: string;
  type: 'finding' | 'question' | 'task' | 'review' | 'failure' | 'completion';
  payload: unknown;
  evidence?: Evidence[];
}

// ----- Supporting types previously missing -----
export interface RepoState {
  root: string;
  headCommit: string;
  changedFiles?: string[];
}

// ----- Criterion used by Task -----
// (already defined above)

// ----- RetryPolicy used by Task -----
// (already defined above)

// ----- ModelPolicy used by Task -----
// (already defined above)

// ----- Evidence used by VerificationResult -----
// (already defined above)

// ----- FileContext, SymbolContext, GitContext, RuleContext, FindingContext -----
// (already defined above)