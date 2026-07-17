import { defineFunction } from '@aws-amplify/backend';

/**
 * The single protected evaluation boundary for the MVP (ADR-003).
 * Model configuration lives in environment variables (§9.4), and
 * application-level spending guardrails are configured here (§14.3).
 */
export const evaluateUseCase = defineFunction({
  name: 'evaluate-use-case',
  entry: './handler.ts',
  timeoutSeconds: 120,
  memoryMB: 512,
  environment: {
    // Model configuration (§9.4). Override per environment as needed.
    BEDROCK_MODEL_ID:
      process.env.BEDROCK_MODEL_ID ?? 'us.anthropic.claude-3-5-haiku-20241022-v1:0',
    PROMPT_VERSION: '1.0.0',
    RUBRIC_VERSION: '1.0.0',
    RULES_VERSION: '1.0.0',
    // Application-level spending guardrails (§14.3). Defaults match the
    // architecture's recommended production values; each is overridable via a
    // deploy-time env var so a sandbox can run with much smaller caps (and
    // therefore much lower Bedrock spend) without changing committed defaults.
    EVALUATIONS_ENABLED: process.env.EVALUATIONS_ENABLED ?? 'true',
    MAX_EVALUATIONS_PER_USE_CASE: process.env.MAX_EVALUATIONS_PER_USE_CASE ?? '3',
    MAX_INPUT_CHARACTERS: process.env.MAX_INPUT_CHARACTERS ?? '20000',
    MAX_OUTPUT_TOKENS: process.env.MAX_OUTPUT_TOKENS ?? '1500',
    MAX_MODEL_RETRIES: process.env.MAX_MODEL_RETRIES ?? '2',
  },
});
