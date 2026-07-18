import { FEATURE_KEYS } from './features';
import { SCORE_CATEGORIES, type ScoreCategory } from './types';

/**
 * Interpretable weighted scorecard — a shrinkage-regularized feature-effect
 * model for the supervised scoring loop (§9.5). Golden labels are absolute
 * truth. Per dimension d:
 *   baseline_d   = mean(golden score_d)
 *   effect_{d,f} = (mean(score_d | f=1) - baseline_d) * n1 / (n1 + K)
 *   score_d      = clamp(round(baseline_d + Σ_{f active} effect_{d,f}), 0, 100)
 * The summed effects ARE the per-score "why" explanation.
 *
 * Limitations (§9.5): sums marginal one-feature-at-a-time effects, not a joint
 * regression, so correlated features can double-count (shrinkage K only damps
 * few-positive effects); needs ≥ MIN_GOLDEN samples or the caller falls back to
 * LLM cold-start; refit on every evaluation (fit-on-read), no stored artifact.
 */

/** Minimum golden samples before the supervised model may drive scores. */
export const MIN_GOLDEN = 3;

/** Shrinkage constant K: effects from few positives are pulled toward zero. */
export const SHRINKAGE_K = 3;

export interface GoldenSample {
  features: Record<string, number>;
  scores: Record<ScoreCategory, number>;
}

export interface Scorecard {
  /** Per-dimension mean of golden scores. */
  baselines: Record<ScoreCategory, number>;
  /** Per-dimension, per-feature shrunk marginal effect. */
  effects: Record<ScoreCategory, Record<string, number>>;
  /** The feature coordinate space this model was fit over. */
  featureKeys: string[];
  /** Number of golden samples the model was fit from. */
  sampleCount: number;
  /** Shrinkage constant used during fitting (for transparency). */
  shrinkageK: number;
}

/** A single active feature's contribution to one dimension's predicted score. */
export interface Contribution {
  feature: string;
  effect: number;
}

export interface DimensionPrediction {
  score: number;
  contributions: Contribution[];
}

export type Prediction = Record<ScoreCategory, DimensionPrediction>;

const NEUTRAL_PRIOR = 50;

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function mean(values: number[]): number {
  if (values.length === 0) return NEUTRAL_PRIOR;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Fit the scorecard from golden samples. Small N is expected (fit-on-read);
 * the feature space is fixed to FEATURE_KEYS so predictions and stored
 * coefficients stay comparable across evaluations.
 */
export function fitScorecard(
  samples: GoldenSample[],
  shrinkageK: number = SHRINKAGE_K,
): Scorecard {
  const featureKeys = [...FEATURE_KEYS];
  const baselines = {} as Record<ScoreCategory, number>;
  const effects = {} as Record<ScoreCategory, Record<string, number>>;

  for (const dim of SCORE_CATEGORIES) {
    const baseline = mean(samples.map((s) => clampScore(s.scores[dim])));
    baselines[dim] = round2(baseline);

    const dimEffects: Record<string, number> = {};
    for (const key of featureKeys) {
      const positives = samples.filter((s) => (s.features[key] ?? 0) === 1);
      const n1 = positives.length;
      if (n1 === 0) {
        dimEffects[key] = 0;
        continue;
      }
      const positiveMean = mean(positives.map((s) => clampScore(s.scores[dim])));
      const rawEffect = positiveMean - baseline;
      // Shrink toward zero when estimated from few positives (§9.5).
      dimEffects[key] = round2(rawEffect * (n1 / (n1 + shrinkageK)));
    }
    effects[dim] = dimEffects;
  }

  return { baselines, effects, featureKeys, sampleCount: samples.length, shrinkageK };
}

/**
 * Predict per-dimension scores for a feature vector, returning the active
 * feature effects (contributions) that produced each score, sorted by
 * magnitude for display.
 */
export function predict(
  model: Scorecard,
  features: Record<string, number>,
): Prediction {
  const result = {} as Prediction;

  for (const dim of SCORE_CATEGORIES) {
    const baseline = model.baselines[dim] ?? NEUTRAL_PRIOR;
    const contributions: Contribution[] = [];
    let total = baseline;

    for (const key of model.featureKeys) {
      if ((features[key] ?? 0) !== 1) continue;
      const effect = model.effects[dim]?.[key] ?? 0;
      total += effect;
      if (effect !== 0) contributions.push({ feature: key, effect });
    }

    contributions.sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));
    result[dim] = { score: clampScore(Math.round(total)), contributions };
  }

  return result;
}

/** Extract just the numeric per-dimension scores from a prediction. */
export function predictedScores(prediction: Prediction): Record<ScoreCategory, number> {
  const scores = {} as Record<ScoreCategory, number>;
  for (const dim of SCORE_CATEGORIES) scores[dim] = prediction[dim].score;
  return scores;
}

/**
 * Overall score = arithmetic mean of the five dimension scores, rounded.
 * Deterministic and explainable (§9.5) — used regardless of score source.
 */
export function overallFromDimensions(scores: Record<ScoreCategory, number>): number {
  return Math.round(mean(SCORE_CATEGORIES.map((dim) => scores[dim])));
}
