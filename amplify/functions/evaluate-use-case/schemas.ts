import {
  RECOMMENDATIONS,
  SCORE_CATEGORIES,
  type ModelAssessment,
  type PolicyReference,
  type Recommendation,
  type ScoreCategory,
} from './types';

/**
 * Local schema validation for the model's structured output.
 * See architecture.md §9.3: parse, validate, reject unknown recommendation
 * values, bound scores, and never persist unvalidated model output.
 */

export type ValidationResult =
  | { ok: true; value: ModelAssessment }
  | { ok: false; errors: string[] };

/** Strip optional markdown fences and extract the first JSON object. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in model response');
  }
  return JSON.parse(trimmed.slice(start, end + 1));
}

function clampScore(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function asStringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, maxItems)
    .map((item) => item.trim().slice(0, maxLength));
}

function asPolicyReferences(value: unknown): PolicyReference[] {
  if (!Array.isArray(value)) return [];
  const refs: PolicyReference[] = [];
  for (const item of value.slice(0, 10)) {
    if (item && typeof item === 'object' && typeof (item as PolicyReference).title === 'string') {
      const ref = item as Record<string, unknown>;
      refs.push({
        title: String(ref.title).slice(0, 200),
        section: typeof ref.section === 'string' ? ref.section.slice(0, 200) : undefined,
        referenceId:
          typeof ref.referenceId === 'string' ? ref.referenceId.slice(0, 100) : undefined,
      });
    }
  }
  return refs;
}

export function validateAssessment(raw: unknown): ValidationResult {
  const errors: string[] = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['Response is not a JSON object'] };
  }
  const obj = raw as Record<string, unknown>;

  // recommendation — reject unknown values outright.
  const recommendation = obj.recommendation;
  if (
    typeof recommendation !== 'string' ||
    !(RECOMMENDATIONS as readonly string[]).includes(recommendation)
  ) {
    errors.push(`Unknown recommendation value: ${JSON.stringify(recommendation)}`);
  }

  // overallScore — must be numeric; bounded to 0-100.
  const overallScore = clampScore(obj.overallScore);
  if (overallScore === undefined) {
    errors.push('overallScore is missing or not a number');
  }

  // summary — required non-empty string.
  const summary =
    typeof obj.summary === 'string' && obj.summary.trim().length > 0
      ? obj.summary.trim().slice(0, 4000)
      : undefined;
  if (summary === undefined) {
    errors.push('summary is missing or empty');
  }

  // scores — all five categories required.
  const scoresRaw = (obj.scores ?? {}) as Record<string, unknown>;
  const scores = {} as Record<ScoreCategory, number>;
  for (const category of SCORE_CATEGORIES) {
    const score = clampScore(scoresRaw[category]);
    if (score === undefined) {
      errors.push(`scores.${category} is missing or not a number`);
    } else {
      scores[category] = score;
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      recommendation: recommendation as Recommendation,
      overallScore: overallScore as number,
      summary: summary as string,
      scores,
      recommendedPattern:
        typeof obj.recommendedPattern === 'string'
          ? obj.recommendedPattern.trim().slice(0, 300)
          : '',
      requiredControls: asStringArray(obj.requiredControls, 20, 300),
      missingInformation: asStringArray(obj.missingInformation, 20, 300),
      policyReferences: asPolicyReferences(obj.policyReferences),
    },
  };
}

/** Merge deterministic and generated controls, removing duplicates (§9.3). */
export function mergeControls(deterministic: string[], generated: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const control of [...deterministic, ...generated]) {
    const key = control.trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      merged.push(control.trim());
    }
  }
  return merged;
}
