/**
 * Shared types for the evaluate-use-case function.
 * See architecture.md §9 (evaluation design) and §10 (function boundaries).
 */

export const RECOMMENDATIONS = [
  'PROCEED',
  'PROCEED_WITH_CONTROLS',
  'REVISE_AND_RESUBMIT',
  'DO_NOT_PROCEED',
  'SPECIALIST_REVIEW_REQUIRED',
] as const;

export type Recommendation = (typeof RECOMMENDATIONS)[number];

export const SCORE_CATEGORIES = [
  'businessValue',
  'technicalFeasibility',
  'dataReadiness',
  'securityAndPrivacyRisk',
  'responsibleAiRisk',
] as const;

export type ScoreCategory = (typeof SCORE_CATEGORIES)[number];

export interface PolicyReference {
  title: string;
  section?: string;
  referenceId?: string;
}

/** The structured output contract required from the model (§9.3). */
export interface ModelAssessment {
  recommendation: Recommendation;
  overallScore: number;
  summary: string;
  scores: Record<ScoreCategory, number>;
  recommendedPattern: string;
  requiredControls: string[];
  missingInformation: string[];
  policyReferences: PolicyReference[];
}

/** A deterministic rule finding, produced before the model call (§9.2). */
export interface DeterministicFlag {
  ruleId: string;
  severity: 'INFO' | 'CONTROL_REQUIRED' | 'SPECIALIST_REVIEW' | 'BLOCK';
  message: string;
}

export interface RuleResult {
  flags: DeterministicFlag[];
  requiredControls: string[];
  missingInformation: string[];
  /**
   * When set, the final stored recommendation may not be more permissive
   * than this value (e.g. a high-impact HR decision can never be PROCEED).
   */
  minimumRecommendation?: Recommendation;
}

/** The subset of UseCase fields the rules engine and prompt builder use. */
export interface UseCaseInput {
  id: string;
  title: string;
  businessProblem: string;
  targetUsers: string[];
  expectedOutcome: string;
  successMetrics: string[];
  proposedCapability: string;
  dataSources: string[];
  dataClassification: string;
  externalFacing: boolean;
  humanOversight: boolean;
  estimatedMonthlyVolume: number | null;
  riskConcerns: string;
}
