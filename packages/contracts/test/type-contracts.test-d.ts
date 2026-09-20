// Type-level contract tests for @runforge/contracts (zero dependencies)
import type {
  VerificationResult,
  VerificationStatus,
  ReadinessLevel,
  StopCondition,
  Task,
  TaskScope,
  TaskComplexity,
  ApprovalState,
  ReviewResult,
  ReviewFinding,
  DriftReport,
  DriftType,
  DriftItem,
  PolicyGrant,
  AgentSpec,
  AdapterConformance,
} from '../src/index.js';

export type Expect<T extends true> = T;
export type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
  ? true
  : false;

// Verify VerificationStatus union contains 'not_observed'
type _TestStatus = Expect<Equal<VerificationStatus, 'verified' | 'failed' | 'skipped' | 'not_observed'>>;

// Verify ReadinessLevel type
type _TestReadiness = Expect<Equal<ReadinessLevel, 'draft' | 'pr-ready' | 'release-ready'>>;

// Verify VerificationResult contains status and readinessLevel
type _TestVerificationResult = Expect<
  Equal<VerificationResult['status'], VerificationStatus>
> & Expect<
  Equal<VerificationResult['readinessLevel'], ReadinessLevel>
>;

// Verify Task extended fields
type _TestTaskFields = Expect<Equal<Task['scope'], TaskScope>> &
  Expect<Equal<Task['estimatedComplexity'], TaskComplexity>> &
  Expect<Equal<Task['approvalState'], ApprovalState>> &
  Expect<Equal<Task['stopConditions'], StopCondition[]>>;

// Verify AgentSpec fileOwnership
type _TestAgentSpec = Expect<Equal<AgentSpec['fileOwnership'], string[]>>;

// Verify ReviewResult findings
type _TestReviewResult = Expect<Equal<ReviewResult['blockingFindings'], ReviewFinding[]>> &
  Expect<Equal<ReviewResult['nonBlockingFindings'], ReviewFinding[]>>;

// Verify DriftReport
type _TestDriftReport = Expect<Equal<DriftReport['items'], DriftItem[]>> &
  Expect<Equal<DriftType, 'unplanned_task' | 'omitted_task' | 'out_of_sequence' | 'scope_creep' | 'unexpected_file_modification'>>;

// Verify PolicyGrant
type _TestPolicyGrant = Expect<Equal<PolicyGrant['actionType'], 'read' | 'write' | 'execute' | 'network' | 'delete'>>;

// Verify AdapterConformance
type _TestAdapterConformance = Expect<Equal<AdapterConformance['enforcedGuarantees'], string[]>>;

