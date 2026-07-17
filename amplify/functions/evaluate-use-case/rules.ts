import type { DeterministicFlag, RuleResult, UseCaseInput } from './types';

/**
 * Deterministic policy checks that run BEFORE the model call.
 * See architecture.md §9.2. Rules are versioned via RULES_VERSION; any
 * behavioral change here requires a version bump in the function resource.
 */

/**
 * Human-readable description of each deterministic rule, rendered on the
 * Decision Framework page so reviewers can see exactly how the engine
 * constrains an approval. Kept next to the executable logic below so the two
 * stay in sync.
 */
export const RULE_CATALOG: Array<{
  ruleId: string;
  condition: string;
  consequence: string;
}> = [
  {
    ruleId: 'HIGH_IMPACT_DOMAIN',
    condition: 'Affects employment, credit, health, legal rights, or essential services',
    consequence: 'Caps the recommendation at SPECIALIST_REVIEW_REQUIRED (model cannot override)',
  },
  {
    ruleId: 'EXTERNAL_NO_OVERSIGHT',
    condition: 'External-facing generated content with no human oversight',
    consequence: 'Requires a human-review-before-publication control',
  },
  {
    ruleId: 'RESTRICTED_DATA',
    condition: 'Data classification is RESTRICTED',
    consequence: 'Requires a security review; caps recommendation at SPECIALIST_REVIEW_REQUIRED',
  },
  {
    ruleId: 'NO_SUCCESS_METRICS',
    condition: 'No measurable success metrics provided',
    consequence: 'Flags missing information',
  },
  {
    ruleId: 'NO_DATA_SOURCE',
    condition: 'No data sources identified',
    consequence: 'Limits recommendation to discovery/prototype',
  },
  {
    ruleId: 'PERSONAL_DATA_NO_RETENTION',
    condition: 'Personal data referenced without a stated retention period',
    consequence: 'Requires a privacy review and a defined retention period',
  },
  {
    ruleId: 'UNVALIDATED_USER_DOCUMENTS',
    condition: 'User-provided documents may be sent to the model',
    consequence: 'Requires file validation and prompt-injection controls',
  },
];

const HIGH_IMPACT_TERMS = [
  'employment',
  'hiring',
  'firing',
  'termination',
  'promotion',
  'performance review',
  'performance rating',
  'credit',
  'loan',
  'insurance claim',
  'medical',
  'health',
  'diagnosis',
  'legal rights',
  'visa',
  'benefits eligibility',
];

const PERSONAL_DATA_TERMS = [
  'personal data',
  'personal information',
  'pii',
  'customer data',
  'employee data',
  'customer record',
  'employee record',
];

const RETENTION_TERMS = ['retention', 'retain', 'delete after', 'deletion period'];

function textOf(useCase: UseCaseInput): string {
  return [
    useCase.title,
    useCase.businessProblem,
    useCase.expectedOutcome,
    useCase.proposedCapability,
    useCase.riskConcerns,
    ...useCase.dataSources,
    ...useCase.targetUsers,
  ]
    .join(' \n ')
    .toLowerCase();
}

function containsAny(haystack: string, terms: string[]): string | undefined {
  return terms.find((term) => haystack.includes(term));
}

export function runDeterministicRules(useCase: UseCaseInput): RuleResult {
  const flags: DeterministicFlag[] = [];
  const requiredControls: string[] = [];
  const missingInformation: string[] = [];
  let minimumRecommendation: RuleResult['minimumRecommendation'];

  const text = textOf(useCase);

  // Rule 1 — high-impact decisions about people require specialist review.
  const highImpactTerm = containsAny(text, HIGH_IMPACT_TERMS);
  if (highImpactTerm) {
    flags.push({
      ruleId: 'HIGH_IMPACT_DOMAIN',
      severity: 'SPECIALIST_REVIEW',
      message: `The proposal appears to affect a high-impact domain ("${highImpactTerm}"). Specialist review is required before approval.`,
    });
    requiredControls.push(
      'Route to specialist review (HR / legal / compliance) before any approval',
    );
    minimumRecommendation = 'SPECIALIST_REVIEW_REQUIRED';
  }

  // Rule 2 — external-facing generated content must have human oversight.
  if (useCase.externalFacing && !useCase.humanOversight) {
    flags.push({
      ruleId: 'EXTERNAL_NO_OVERSIGHT',
      severity: 'CONTROL_REQUIRED',
      message:
        'External-facing generated content is proposed without human oversight.',
    });
    requiredControls.push('Require human review before external publication');
  }

  // Rule 3 — restricted data requires a security review.
  if (useCase.dataClassification === 'RESTRICTED') {
    flags.push({
      ruleId: 'RESTRICTED_DATA',
      severity: 'BLOCK',
      message:
        'Restricted data is referenced. An approved processing path and security review are required.',
    });
    requiredControls.push('Complete a security review of the data processing path');
    if (!minimumRecommendation) {
      minimumRecommendation = 'SPECIALIST_REVIEW_REQUIRED';
    }
  }

  // Rule 4 — no measurable outcome.
  if (useCase.successMetrics.length === 0) {
    flags.push({
      ruleId: 'NO_SUCCESS_METRICS',
      severity: 'INFO',
      message: 'No measurable success metrics were provided.',
    });
    missingInformation.push('Measurable success metrics');
  }

  // Rule 5 — no approved data source.
  if (useCase.dataSources.length === 0) {
    flags.push({
      ruleId: 'NO_DATA_SOURCE',
      severity: 'INFO',
      message:
        'No data sources were identified. Recommendation should be limited to discovery or prototype.',
    });
    missingInformation.push('Approved data sources');
  }

  // Rule 6 — expected volume missing.
  if (useCase.estimatedMonthlyVolume === null) {
    missingInformation.push('Expected monthly request volume');
  }

  // Rule 7 — personal data without a stated retention period.
  const personalTerm = containsAny(text, PERSONAL_DATA_TERMS);
  if (personalTerm && !containsAny(text, RETENTION_TERMS)) {
    flags.push({
      ruleId: 'PERSONAL_DATA_NO_RETENTION',
      severity: 'CONTROL_REQUIRED',
      message: `Personal data appears to be involved ("${personalTerm}") without a stated retention period.`,
    });
    requiredControls.push('Complete a privacy review and define a retention period');
    missingInformation.push('Confirmed retention period for personal data');
  }

  // Rule 8 — user-provided documents sent to the model need validation.
  if (containsAny(text, ['upload', 'user document', 'attachment', 'user-provided'])) {
    flags.push({
      ruleId: 'UNVALIDATED_USER_DOCUMENTS',
      severity: 'CONTROL_REQUIRED',
      message:
        'User-provided documents may be sent to the model. File validation and prompt-injection controls are required.',
    });
    requiredControls.push('Validate user-provided files and apply prompt-injection controls');
  }

  return { flags, requiredControls, missingInformation, minimumRecommendation };
}

/**
 * Order recommendations from most to least permissive so a deterministic
 * floor can cap the model's recommendation.
 */
const PERMISSIVENESS: Record<string, number> = {
  PROCEED: 4,
  PROCEED_WITH_CONTROLS: 3,
  REVISE_AND_RESUBMIT: 2,
  SPECIALIST_REVIEW_REQUIRED: 1,
  DO_NOT_PROCEED: 0,
};

export function applyRecommendationFloor(
  modelRecommendation: string,
  minimum: string | undefined,
): string {
  if (!minimum) return modelRecommendation;
  return PERMISSIVENESS[modelRecommendation] > PERMISSIVENESS[minimum]
    ? minimum
    : modelRecommendation;
}
