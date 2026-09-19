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
export type VerificationStatus = 'verified' | 'failed' | 'skipped' | 'not_observed';

export type ReadinessLevel = 'draft' | 'pr-ready' | 'release-ready';

/**
 * VerificationResult:
 * Note: 'not_observed' means the check did not run or produced no evidence.
 * MUST NEVER be counted as a pass, and MUST NOT be silently rendered as a fail.
 */
export interface VerificationResult {
  taskId: string;
  status: VerificationStatus;
  evidence: Evidence[];
  timestamp: number;
  readinessLevel: ReadinessLevel;
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

export interface PolicyGrant {
  id: string;
  grantee: string;
  actionType: 'read' | 'write' | 'execute' | 'network' | 'delete';
  resourcePattern: string;
  expiresAt?: number;
  approvedBy: string;
  rationale: string;
}

export interface PolicyPort {
  evaluate(action: ActionRequest): Promise<PolicyDecision>;
}

// ----- Capability Isolation (Phase 7) -----
/**
 * Describes the harness control plane the agent execution environment must
 * never reach. The compiled-in floor (packages/core) is the non-overridable
 * minimum; configured surfaces may only ADD hosts/ports/paths, never remove
 * floor entries.
 */
export interface ControlPlaneSurface {
  /** Hostnames/addresses the harness control interface binds to. */
  controlHosts: readonly string[];
  /** Ports the harness control interface listens on. */
  controlPorts: readonly number[];
  /** Path prefixes owned by the harness control plane (config, traces, proposals). */
  controlPaths: readonly string[];
}

// ----- SubAgentRouter -----
export interface AgentSpec {
  name: string;
  capabilities: string[];
  costTier: 'fast' | 'balanced' | 'reasoning';
  fileOwnership: string[];
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
export interface StopCondition {
  type: 'max_retries' | 'cost_limit' | 'time_limit' | 'consecutive_failures' | 'custom';
  threshold: number | string;
  description?: string;
}

export type TaskComplexity = 'LOW' | 'MEDIUM' | 'HIGH';
export type ApprovalState = 'draft' | 'approved' | 'rejected';

export interface TaskScope {
  in: string[];
  out: string[];
}

export interface Task {
  id: string;
  objective: string;
  inputs: ContextSpec;
  successCriteria: Criterion[];
  retryPolicy: RetryPolicy;
  modelPolicy: ModelPolicy;
  dependencies: string[];
  scope: TaskScope;
  estimatedComplexity: TaskComplexity;
  approvalState: ApprovalState;
  stopConditions: StopCondition[];
}

export interface AgentMessage {
  from: string;
  to: string;
  type: 'finding' | 'question' | 'task' | 'review' | 'failure' | 'completion';
  payload: unknown;
  evidence?: Evidence[];
}

// ----- ReviewResult -----
export interface ReviewFinding {
  id: string;
  severity: 'critical' | 'major' | 'minor' | 'info';
  category: string;
  description: string;
  filePath?: string;
  lineNumber?: number;
  suggestion?: string;
}

export interface ReviewResult {
  reviewer: string;
  approved: boolean;
  blockingFindings: ReviewFinding[];
  nonBlockingFindings: ReviewFinding[];
  summary: string;
  timestamp: number;
}

// ----- DriftReport -----
export type DriftType =
  | 'unplanned_task'
  | 'omitted_task'
  | 'out_of_sequence'
  | 'scope_creep'
  | 'unexpected_file_modification';

export interface DriftItem {
  type: DriftType;
  description: string;
  detectedAt: number;
  severity: 'low' | 'medium' | 'high';
  details?: Record<string, unknown>;
}

export interface DriftReport {
  taskId: string;
  driftScore: number;
  items: DriftItem[];
  projectedFromTraceEvents: number;
  timestamp: number;
}

// ----- OQS (Orchestration Quality Score) -----
export interface OQSDimensionScore {
  name: string;
  score: number;
  weight: number;
  contributingFactors: string[];
}

export interface OQSScore {
  planQuality: number;
  assignmentQuality: number;
  coordination: number;
  deliverableQuality: number;
  efficiency: number;
  composite: number;
  details: {
    driftReport: DriftReport;
    dimensionWeights: Record<string, number>;
  };
}

// ----- AdapterConformance -----
export interface AdapterConformance {
  adapterName: string;
  portName: string;
  enforcedGuarantees: string[];
  unenforcedGuarantees: string[];
  limitations: string[];
  verifiedAt?: number;
}

// ----- Model Capability (for model routing) -----
export interface ModelCapability {
  name: string;
  costTier: 'free' | 'low' | 'medium' | 'high' | 'premium';
  latencyMs: number;
  contextWindow: number;
  strengths: string[];
  provider: string;
  modelName: string;
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