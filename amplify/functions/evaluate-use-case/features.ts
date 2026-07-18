import { RULE_CATALOG, runDeterministicRules } from './rules';
import type { UseCaseInput } from './types';

/**
 * Structured feature extraction for the supervised scoring model (§9.5).
 *
 * Features are structured-only (form fields + deterministic-rule hits); no
 * Bedrock call, so extraction is free, deterministic, and runs identically in
 * the Lambda and the browser preview. Every feature is binary (0/1) to keep the
 * additive scorecard in `model.ts` interpretable. FEATURE_CATALOG is the single
 * source of truth; keep keys stable — they are stored in GoldenLabel snapshots.
 */

export interface FeatureDef {
  key: string;
  label: string;
  description: string;
  /** Grouping for display on the Decision Framework page. */
  group: 'Data' | 'Exposure' | 'Governance' | 'Scale' | 'Rule hit';
}

const DATA_CLASSIFICATIONS = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'] as const;

const staticFeatures: FeatureDef[] = [
  // Data classification (one-hot).
  {
    key: 'dc_PUBLIC',
    label: 'Data classification: Public',
    description: 'The proposal handles public data only.',
    group: 'Data',
  },
  {
    key: 'dc_INTERNAL',
    label: 'Data classification: Internal',
    description: 'The proposal handles internal data.',
    group: 'Data',
  },
  {
    key: 'dc_CONFIDENTIAL',
    label: 'Data classification: Confidential',
    description: 'The proposal handles confidential data.',
    group: 'Data',
  },
  {
    key: 'dc_RESTRICTED',
    label: 'Data classification: Restricted',
    description: 'The proposal handles restricted data.',
    group: 'Data',
  },
  // Exposure and governance.
  {
    key: 'externalFacing',
    label: 'External-facing',
    description: 'Generated content is exposed outside the organization.',
    group: 'Exposure',
  },
  {
    key: 'humanOversight',
    label: 'Human oversight planned',
    description: 'A human reviews output before it is used.',
    group: 'Governance',
  },
  {
    key: 'hasSuccessMetrics',
    label: 'Has success metrics',
    description: 'At least one measurable success metric is provided.',
    group: 'Governance',
  },
  // Data-source count buckets.
  {
    key: 'ds_none',
    label: 'No data sources',
    description: 'No data sources were identified.',
    group: 'Data',
  },
  {
    key: 'ds_few',
    label: '1–2 data sources',
    description: 'One or two data sources were identified.',
    group: 'Data',
  },
  {
    key: 'ds_many',
    label: '3+ data sources',
    description: 'Three or more data sources were identified.',
    group: 'Data',
  },
  // Estimated-volume buckets.
  {
    key: 'vol_unknown',
    label: 'Volume: not provided',
    description: 'Estimated monthly volume was not provided.',
    group: 'Scale',
  },
  {
    key: 'vol_low',
    label: 'Volume: low (<1k/mo)',
    description: 'Fewer than 1,000 requests per month.',
    group: 'Scale',
  },
  {
    key: 'vol_med',
    label: 'Volume: medium (1k–10k/mo)',
    description: 'Between 1,000 and 10,000 requests per month.',
    group: 'Scale',
  },
  {
    key: 'vol_high',
    label: 'Volume: high (>10k/mo)',
    description: 'More than 10,000 requests per month.',
    group: 'Scale',
  },
];

/** One binary feature per deterministic rule, keyed `rule_<ruleId>`. */
const ruleFeatures: FeatureDef[] = RULE_CATALOG.map((rule) => ({
  key: `rule_${rule.ruleId}`,
  label: `Rule hit: ${rule.ruleId}`,
  description: rule.condition,
  group: 'Rule hit' as const,
}));

export const FEATURE_CATALOG: FeatureDef[] = [...staticFeatures, ...ruleFeatures];

/** Stable, ordered list of feature keys — the model's coordinate space. */
export const FEATURE_KEYS: string[] = FEATURE_CATALOG.map((f) => f.key);

const LABEL_BY_KEY: Record<string, string> = Object.fromEntries(
  FEATURE_CATALOG.map((f) => [f.key, f.label]),
);

/** Human-readable label for a feature key (falls back to the raw key). */
export function featureLabel(key: string): string {
  return LABEL_BY_KEY[key] ?? key;
}

function volumeBucket(volume: number | null): string {
  if (volume === null) return 'vol_unknown';
  if (volume < 1000) return 'vol_low';
  if (volume <= 10000) return 'vol_med';
  return 'vol_high';
}

function dataSourceBucket(count: number): string {
  if (count === 0) return 'ds_none';
  if (count <= 2) return 'ds_few';
  return 'ds_many';
}

/** Extract the binary feature vector. Every catalog key is present (0/1) so
 *  models and snapshots share a fixed coordinate space; rule-hit features reuse
 *  `runDeterministicRules` so the two engines can never drift apart. */
export function extractFeatures(useCase: UseCaseInput): Record<string, number> {
  const features: Record<string, number> = {};
  for (const key of FEATURE_KEYS) features[key] = 0;

  // Data classification one-hot (unknown/blank classification lights nothing).
  const dc = (useCase.dataClassification ?? '').toUpperCase();
  if ((DATA_CLASSIFICATIONS as readonly string[]).includes(dc)) {
    features[`dc_${dc}`] = 1;
  }

  features.externalFacing = useCase.externalFacing ? 1 : 0;
  features.humanOversight = useCase.humanOversight ? 1 : 0;
  features.hasSuccessMetrics = useCase.successMetrics.length > 0 ? 1 : 0;

  features[dataSourceBucket(useCase.dataSources.length)] = 1;
  features[volumeBucket(useCase.estimatedMonthlyVolume)] = 1;

  // Deterministic-rule hits — the same engine that constrains the recommendation.
  for (const flag of runDeterministicRules(useCase).flags) {
    const key = `rule_${flag.ruleId}`;
    if (key in features) features[key] = 1;
  }

  return features;
}
