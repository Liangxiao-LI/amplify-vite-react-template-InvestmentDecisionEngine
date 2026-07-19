/**
 * Single source of truth for framework versions and the approved-model
 * allow-list. Imported by:
 *  - resource.ts        (Lambda env defaults)
 *  - handler.ts         (validate the admin-tuned model)
 *  - seed-demo-data     (stamp seeded evaluations with versions)
 *  - the frontend        (Decision Framework page + Admin model tuner)
 *
 * See architecture.md §9.3 (traceability) and §9.4 (model configuration).
 */

export const PROMPT_VERSION = '1.0.0';
export const RUBRIC_VERSION = '1.0.0';
export const RULES_VERSION = '1.0.0';

export interface ApprovedModel {
  id: string;
  label: string;
  note: string;
}

/**
 * Bedrock model / inference-profile IDs an Administrator may select for
 * generating the decision card. The admin's choice is validated against this
 * list at evaluation time so an arbitrary or unenabled model can never be
 * invoked (avoids AccessDenied and cost surprises). Each model must be
 * enabled in the deployment region's Bedrock console before it will work.
 */
export const APPROVED_MODELS: ApprovedModel[] = [
  {
    id: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    label: 'Claude Haiku 4.5',
    note: 'Fastest and lowest cost — default for demos.',
  },
  {
    id: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    label: 'Claude Sonnet 4.5',
    note: 'Higher quality reasoning, higher cost.',
  },
];

export const DEFAULT_MODEL_ID = APPROVED_MODELS[0].id;

export function isApprovedModel(modelId: string | null | undefined): boolean {
  return !!modelId && APPROVED_MODELS.some((model) => model.id === modelId);
}
