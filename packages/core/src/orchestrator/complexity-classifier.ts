import type {
  Task,
  TaskComplexity,
} from '@runforge/contracts';

export interface ComplexityClassifierOptions {
  /** Enable detailed signal logging for debugging */
  debug?: boolean;
}

/**
 * Signals used for complexity classification
 */
export interface ComplexitySignals {
  fileCount: number;
  securitySensitivity: boolean;
  databaseChanges: boolean;
  apiChanges: boolean;
  unknownCount: number;
  testCoverageGap: boolean;
  dependencyCount: number;
  hasMigrations: boolean;
  externalDependencies: boolean;
}

/**
 * Result of complexity classification
 */
export interface ComplexityClassification {
  complexity: TaskComplexity;
  confidence: number;
  signals: ComplexitySignals;
  rationale: string;
}

/**
 * Default thresholds for complexity classification
 */
export const DEFAULT_COMPLEXITY_THRESHOLDS = {
  // LOW thresholds
  low: {
    maxFiles: 3,
    maxDependencies: 2,
    maxUnknowns: 0,
  },
  // MEDIUM thresholds
  medium: {
    maxFiles: 10,
    maxDependencies: 5,
    maxUnknowns: 2,
  },
  // HIGH thresholds - anything beyond MEDIUM
} as const;

/**
 * Analyzes a task and extracts complexity signals
 */
export function analyzeComplexitySignals(task: Task): ComplexitySignals {
  const fileCount = task.scope?.in?.length ?? 0;
  const dependencyCount = task.dependencies?.length ?? 0;
  
  // Analyze objective for signals
  const objectiveLower = task.objective.toLowerCase();
  
  const securitySensitivity = 
    /password|secret|token|auth|credential|encrypt|decrypt|security|audit|compliance|pci|hipaa|gdpr/.test(objectiveLower);
  
  const databaseChanges = 
    /migration|schema|database|table|column|index|sql|db\.|prisma|drizzle|orm|entity/.test(objectiveLower);
  
  const apiChanges = 
    /api|endpoint|route|controller|rest|graphql|endpoint|swagger|openapi/.test(objectiveLower);
  
  // Count unknown indicators
  const unknownKeywords = /unknown|unclear|tbd|explore|investigate|research|figure out|determine/.test(objectiveLower);
  const unknownCount = unknownKeywords ? 1 : 0;
  
  const testCoverageGap = 
    /test|spec|coverage/.test(objectiveLower) && !/add test|write test|improve test/.test(objectiveLower);
  
  const hasMigrations = 
    /migration|migrate/.test(objectiveLower);
  
  const externalDependencies = 
    /third.?party|external|integration|webhook|webhook|oauth|sso|saml|ldap/.test(objectiveLower);

  return {
    fileCount,
    securitySensitivity,
    databaseChanges,
    apiChanges,
    unknownCount,
    testCoverageGap,
    dependencyCount,
    hasMigrations,
    externalDependencies,
  };
}

/**
 * Classifies task complexity based on extracted signals
 */
export function classifyComplexity(
  task: Task,
  options: { thresholds?: typeof DEFAULT_COMPLEXITY_THRESHOLDS } = {}
): ComplexityClassification {
  const signals = analyzeComplexitySignals(task);
  const thresholds = options.thresholds ?? DEFAULT_COMPLEXITY_THRESHOLDS;
  
  let complexity: TaskComplexity = 'LOW';
  let confidence = 1.0;
  const reasons: string[] = [];

  // Check for HIGH complexity signals first
  const highSignals = [
    signals.securitySensitivity,
    signals.databaseChanges && signals.hasMigrations,
    signals.apiChanges && signals.externalDependencies,
    signals.unknownCount > thresholds.medium.maxUnknowns,
    signals.dependencyCount > thresholds.medium.maxDependencies,
    signals.fileCount > thresholds.medium.maxFiles,
    signals.testCoverageGap,
  ].filter(Boolean).length;

  if (highSignals >= 2) {
    complexity = 'HIGH';
    confidence = 0.9;
    if (signals.securitySensitivity) reasons.push('security-sensitive operation');
    if (signals.databaseChanges && signals.hasMigrations) reasons.push('database migration');
    if (signals.apiChanges && signals.externalDependencies) reasons.push('API with external deps');
    if (signals.unknownCount > thresholds.medium.maxUnknowns) reasons.push('multiple unknowns');
    if (signals.dependencyCount > thresholds.medium.maxDependencies) reasons.push('high dependency count');
    if (signals.fileCount > thresholds.medium.maxFiles) reasons.push('many files');
    if (signals.testCoverageGap) reasons.push('test coverage gap');
  } else if (highSignals === 1) {
    complexity = 'MEDIUM';
    confidence = 0.75;
    if (signals.securitySensitivity) reasons.push('security-sensitive operation');
    if (signals.databaseChanges) reasons.push('database changes');
    if (signals.apiChanges) reasons.push('API changes');
    if (signals.unknownCount > 0) reasons.push('has unknowns');
    if (signals.dependencyCount > 0) reasons.push('has dependencies');
    if (signals.fileCount > thresholds.low.maxFiles) reasons.push('multiple files');
  } else {
    // Check for MEDIUM signals
    const mediumSignals = [
      signals.fileCount > thresholds.low.maxFiles,
      signals.dependencyCount > thresholds.low.maxDependencies,
      signals.databaseChanges,
      signals.apiChanges,
      signals.externalDependencies,
    ].filter(Boolean).length;

    if (mediumSignals >= 1) {
      complexity = 'MEDIUM';
      confidence = 0.6;
      if (signals.fileCount > thresholds.low.maxFiles) reasons.push('multiple files');
      if (signals.dependencyCount > thresholds.low.maxDependencies) reasons.push('has dependencies');
      if (signals.databaseChanges) reasons.push('database changes');
      if (signals.apiChanges) reasons.push('API changes');
    } else {
      complexity = 'LOW';
      confidence = 0.8;
      reasons.push('simple, well-scoped task');
    }
  }

  return {
    complexity,
    confidence,
    signals,
    rationale: reasons.join('; ') || 'standard classification',
  };
}

/**
 * Creates a complexity classifier with default options
 */
export function createComplexityClassifier(
  options?: { thresholds?: typeof DEFAULT_COMPLEXITY_THRESHOLDS }
): {
  classify: (task: Task) => ComplexityClassification;
  analyzeSignals: (task: Task) => ComplexitySignals;
} {
  return {
    classify: (task: Task) => classifyComplexity(task, options),
    analyzeSignals: (task: Task) => analyzeComplexitySignals(task),
  };
}