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
    id: 'us.amazon.nova-lite-v1:0',
    label: 'Amazon Nova Lite',
    note: 'Fastest and lowest cost — default for demos.',
  },
  {
    id: 'us.amazon.nova-pro-v1:0',
    label: 'Amazon Nova Pro',
    note: 'Higher quality reasoning, higher cost.',
  },
  {
    id: 'us.meta.llama3-3-70b-instruct-v1:0',
    label: 'Llama 3.3 70B Instruct',
    note: 'Open-weight Meta model — strong general reasoning.',
  },
  {
    id: 'mistral.mistral-large-2407-v1:0',
    label: 'Mistral Large (24.07)',
    note: 'Open-weight Mistral model — good structured output.',
  },
  {
    id: 'us.deepseek.r1-v1:0',
    label: 'DeepSeek-R1',
    note: 'Reasoning model — needs higher MAX_OUTPUT_TOKENS (see resource.ts).',
  },
];

export const DEFAULT_MODEL_ID = APPROVED_MODELS[0].id;

export function isApprovedModel(modelId: string | null | undefined): boolean {
  return !!modelId && APPROVED_MODELS.some((model) => model.id === modelId);
}
