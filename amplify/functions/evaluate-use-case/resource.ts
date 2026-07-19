import { defineFunction } from '@aws-amplify/backend';

/** The single protected evaluation boundary (ADR-003). Model config and
 *  application-level spending guardrails live in env vars (§9.4, §14.3). */
export const evaluateUseCase = defineFunction({
  name: 'evaluate-use-case',
  entry: './handler.ts',
  timeoutSeconds: 120,
  memoryMB: 256,
  environment: {
    BEDROCK_MODEL_ID:
      process.env.BEDROCK_MODEL_ID ?? 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    PROMPT_VERSION: '1.0.0',
    RUBRIC_VERSION: '1.0.0',
    RULES_VERSION: '1.0.0',
    // Spending guardrails (§14.3); each is overridable per environment.
    EVALUATIONS_ENABLED: process.env.EVALUATIONS_ENABLED ?? 'true',
    MAX_EVALUATIONS_PER_USE_CASE: process.env.MAX_EVALUATIONS_PER_USE_CASE ?? '3',
    MAX_INPUT_CHARACTERS: process.env.MAX_INPUT_CHARACTERS ?? '20000',
    MAX_OUTPUT_TOKENS: process.env.MAX_OUTPUT_TOKENS ?? '800',
    MAX_MODEL_RETRIES: process.env.MAX_MODEL_RETRIES ?? '2',
  },
});
