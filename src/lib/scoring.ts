import { client, parseJsonField, type UseCase } from './amplify-client';
import type { Schema } from '../../amplify/data/resource';
import { extractFeatures } from '../../amplify/functions/evaluate-use-case/features';
import {
  MIN_GOLDEN,
  fitScorecard,
  type GoldenSample,
  type Scorecard,
} from '../../amplify/functions/evaluate-use-case/model';
import {
  SCORE_CATEGORIES,
  type ScoreCategory,
  type UseCaseInput,
} from '../../amplify/functions/evaluate-use-case/types';

/**
 * Client-side scoring helpers for the supervised loop (architecture.md §9.5).
 *
 * The browser reuses the exact same pure `features.ts` / `model.ts` modules the
 * evaluation Lambda uses, so the Decision Framework preview and the senior
 * labelling form can never drift from what production actually computes.
 */

export type GoldenLabel = Schema['GoldenLabel']['type'];

export { MIN_GOLDEN };
export type { Scorecard };

/** Map a stored UseCase record to the pure UseCaseInput feature-extraction shape. */
export function toUseCaseInput(useCase: UseCase): UseCaseInput {
  const strings = (values: (string | null)[] | null | undefined) =>
    (values ?? []).filter((value): value is string => !!value);
  return {
    id: useCase.id,
    title: useCase.title,
    businessProblem: useCase.businessProblem,
    targetUsers: strings(useCase.targetUsers),
    expectedOutcome: useCase.expectedOutcome ?? '',
    successMetrics: strings(useCase.successMetrics),
    proposedCapability: useCase.proposedCapability ?? '',
    dataSources: strings(useCase.dataSources),
    dataClassification: useCase.dataClassification ?? '',
    externalFacing: useCase.externalFacing ?? false,
    humanOversight: useCase.humanOversight ?? true,
    estimatedMonthlyVolume: useCase.estimatedMonthlyVolume ?? null,
    riskConcerns: useCase.riskConcerns ?? '',
  };
}

/** Extract the structured feature vector for a use case (client-side). */
export function featuresForUseCase(useCase: UseCase): Record<string, number> {
  return extractFeatures(toUseCaseInput(useCase));
}

function toFeatureVector(value: unknown): Record<string, number> | null {
  const obj = parseJsonField<Record<string, unknown>>(value);
  if (!obj || typeof obj !== 'object') return null;
  const features: Record<string, number> = {};
  for (const [key, raw] of Object.entries(obj)) {
    const num = Number(raw);
    features[key] = Number.isFinite(num) ? num : 0;
  }
  return features;
}

function toScoreVector(value: unknown): Record<ScoreCategory, number> | null {
  const obj = parseJsonField<Record<string, unknown>>(value);
  if (!obj || typeof obj !== 'object') return null;
  const scores = {} as Record<ScoreCategory, number>;
  for (const category of SCORE_CATEGORIES) {
    const num = Number(obj[category]);
    if (!Number.isFinite(num)) return null;
    scores[category] = num;
  }
  return scores;
}

/** Fetch every golden label (small N) and convert usable ones to model samples. */
export async function fetchGoldenSamples(): Promise<GoldenSample[]> {
  const { data } = await client.models.GoldenLabel.list({ limit: 1000 });
  const samples: GoldenSample[] = [];
  for (const label of data ?? []) {
    const features = toFeatureVector(label.features);
    const scores = toScoreVector(label.scores);
    if (features && scores) samples.push({ features, scores });
  }
  return samples;
}

/** Golden labels recorded for one use case (used to block duplicate labelling). */
export async function fetchGoldenLabelsForUseCase(useCaseId: string): Promise<GoldenLabel[]> {
  const { data } = await client.models.GoldenLabel.list({
    filter: { useCaseId: { eq: useCaseId } },
  });
  return data ?? [];
}

export interface FittedModel {
  /** Fitted scorecard, or null when below MIN_GOLDEN (cold start). */
  model: Scorecard | null;
  sampleCount: number;
}

/**
 * Load all golden samples and fit the scorecard when there are enough
 * (>= MIN_GOLDEN). Mirrors the Lambda's fit-on-read behaviour for display.
 */
export async function loadFittedScorecard(): Promise<FittedModel> {
  const samples = await fetchGoldenSamples();
  return {
    model: samples.length >= MIN_GOLDEN ? fitScorecard(samples) : null,
    sampleCount: samples.length,
  };
}
