import { env } from '$amplify/env/evaluate-use-case';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';
import type { Schema } from '../../data/resource';
import { applyRecommendationFloor, runDeterministicRules } from './rules';
import { buildSystemPrompt, buildUserPrompt } from './prompt';
import { extractJson, mergeControls, validateAssessment } from './schemas';
import type { Recommendation, UseCaseInput } from './types';

/**
 * evaluate-use-case — the single protected evaluation boundary (ADR-003).
 *
 * Verifies the caller, confirms the use case is evaluable, applies
 * deterministic rules, calls Amazon Bedrock, validates the structured
 * output, persists the evaluation, and records status events.
 * See architecture.md §9, §10, §14.3, §19.
 */

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();
const bedrock = new BedrockRuntimeClient();

interface CognitoIdentity {
  sub?: string;
  username?: string;
  groups?: string[] | null;
}

type EvaluateResult = {
  ok: boolean;
  evaluationId?: string;
  status?: string;
  error?: string;
};

function log(entry: Record<string, unknown>) {
  // Structured logs without prompts or raw model output (§15).
  console.log(JSON.stringify(entry));
}

function toUseCaseInput(useCase: Schema['UseCase']['type']): UseCaseInput {
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

async function recordStatusEvent(params: {
  useCaseId: string;
  actorId: string;
  actorType: 'USER' | 'SYSTEM';
  fromStatus: string;
  toStatus: string;
  eventType: string;
  detail?: string;
}) {
  const { errors } = await client.models.StatusEvent.create(params);
  if (errors?.length) {
    log({ operation: 'recordStatusEvent', outcome: 'error', errors: errors.map((e) => e.message) });
  }
}

async function setStatus(
  useCaseId: string,
  status: Schema['UseCase']['type']['status'],
  extra: Partial<{ currentEvaluationId: string }> = {},
) {
  const { errors } = await client.models.UseCase.update({ id: useCaseId, status, ...extra });
  if (errors?.length) {
    throw new Error(`Failed to update use case status: ${errors[0].message}`);
  }
}

async function callBedrock(systemPrompt: string, userPrompt: string) {
  const maxRetries = Number(env.MAX_MODEL_RETRIES);
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await bedrock.send(
        new ConverseCommand({
          modelId: env.BEDROCK_MODEL_ID,
          system: [{ text: systemPrompt }],
          messages: [{ role: 'user', content: [{ text: userPrompt }] }],
          inferenceConfig: {
            maxTokens: Number(env.MAX_OUTPUT_TOKENS),
            temperature: 0.2,
            topP: 0.9,
          },
        }),
      );
      const text = response.output?.message?.content
        ?.map((block) => ('text' in block ? block.text : ''))
        .join('');
      if (!text) throw new Error('Empty model response');
      return { text, usage: response.usage };
    } catch (error) {
      lastError = error;
      const name = (error as Error)?.name ?? '';
      const retryable = name === 'ThrottlingException' || name === 'ServiceUnavailableException';
      if (!retryable || attempt === maxRetries) throw error;
      // Bounded exponential backoff (§19).
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
    }
  }
  throw lastError;
}

export const handler: Schema['evaluateUseCase']['functionHandler'] = async (
  event,
  context,
): Promise<EvaluateResult> => {
  const correlationId = context.awsRequestId;
  const { useCaseId } = event.arguments;
  const identity = (event.identity ?? {}) as CognitoIdentity;
  const actorId = identity.sub ?? 'unknown';
  const groups = identity.groups ?? [];

  const base = { correlationId, useCaseId, actorId, operation: 'evaluateUseCase' };

  // Feature flag — an Administrator can disable evaluations (§14.3).
  if (env.EVALUATIONS_ENABLED !== 'true') {
    log({ ...base, outcome: 'disabled' });
    return { ok: false, error: 'Evaluations are currently disabled by an administrator.' };
  }

  if (!identity.sub) {
    log({ ...base, outcome: 'unauthenticated' });
    return { ok: false, error: 'Authentication is required.' };
  }

  // Load the use case (the function role has schema access; enforce
  // caller-level authorization explicitly below).
  const { data: useCase, errors: loadErrors } = await client.models.UseCase.get({
    id: useCaseId,
  });
  if (loadErrors?.length || !useCase) {
    log({ ...base, outcome: 'not_found' });
    return { ok: false, error: 'Use case not found.' };
  }

  // Only the owner or an authorized Reviewer/Admin may request evaluation (§14.3).
  const isOwner = !!useCase.owner && useCase.owner.startsWith(identity.sub);
  const isPrivileged = groups.includes('REVIEWER') || groups.includes('ADMIN');
  if (!isOwner && !isPrivileged) {
    log({ ...base, outcome: 'forbidden' });
    return { ok: false, error: 'You are not authorized to evaluate this use case.' };
  }

  // Confirm the use case is in an evaluable state; EVALUATING also acts as
  // a concurrency guard against duplicate requests (§10, §14.3, §19).
  const evaluableStates = ['SUBMITTED', 'EVALUATION_FAILED'];
  if (useCase.status === 'EVALUATING') {
    log({ ...base, outcome: 'duplicate_request' });
    return { ok: false, error: 'An evaluation is already in progress for this use case.' };
  }
  if (!useCase.status || !evaluableStates.includes(useCase.status)) {
    log({ ...base, outcome: 'invalid_state', status: useCase.status });
    return {
      ok: false,
      error: `Use case is not in an evaluable state (current: ${useCase.status ?? 'unknown'}). Submit it first.`,
    };
  }

  // Per-use-case evaluation limit (§14.3).
  const { data: priorEvaluations } = await client.models.Evaluation.list({
    filter: { useCaseId: { eq: useCaseId } },
  });
  const maxEvaluations = Number(env.MAX_EVALUATIONS_PER_USE_CASE);
  if ((priorEvaluations?.length ?? 0) >= maxEvaluations) {
    log({ ...base, outcome: 'limit_reached', priorEvaluations: priorEvaluations?.length });
    return {
      ok: false,
      error: `This use case has reached the maximum of ${maxEvaluations} evaluations.`,
    };
  }

  // Input size guardrail (§14.3).
  const input = toUseCaseInput(useCase);
  const totalChars = JSON.stringify(input).length;
  if (totalChars > Number(env.MAX_INPUT_CHARACTERS)) {
    log({ ...base, outcome: 'input_too_large', totalChars });
    return { ok: false, error: 'The use case content exceeds the maximum evaluable size.' };
  }

  const previousStatus = useCase.status;
  await setStatus(useCaseId, 'EVALUATING');
  await recordStatusEvent({
    useCaseId,
    actorId,
    actorType: 'USER',
    fromStatus: previousStatus,
    toStatus: 'EVALUATING',
    eventType: 'EVALUATION_STARTED',
  });

  const started = Date.now();
  try {
    // Deterministic checks run before the model call (§9.2).
    const ruleResult = runDeterministicRules(input);

    const { text, usage } = await callBedrock(
      buildSystemPrompt(env.RUBRIC_VERSION),
      buildUserPrompt(input, ruleResult),
    );

    // Validate and normalize — never persist unvalidated output (§9.3).
    const validation = validateAssessment(extractJson(text));
    if (!validation.ok) {
      throw new Error(`Model response failed schema validation: ${validation.errors.join('; ')}`);
    }
    const assessment = validation.value;

    const recommendation = applyRecommendationFloor(
      assessment.recommendation,
      ruleResult.minimumRecommendation,
    ) as Recommendation;

    const { data: evaluation, errors: createErrors } = await client.models.Evaluation.create({
      useCaseId,
      recommendation,
      overallScore: assessment.overallScore,
      summary: assessment.summary,
      scores: JSON.stringify(assessment.scores),
      recommendedPattern: assessment.recommendedPattern,
      requiredControls: mergeControls(ruleResult.requiredControls, assessment.requiredControls),
      missingInformation: mergeControls(
        ruleResult.missingInformation,
        assessment.missingInformation,
      ),
      policyReferences: JSON.stringify(assessment.policyReferences),
      deterministicFlags: JSON.stringify(ruleResult.flags),
      modelId: env.BEDROCK_MODEL_ID,
      modelConfiguration: JSON.stringify({
        maxTokens: Number(env.MAX_OUTPUT_TOKENS),
        temperature: 0.2,
        topP: 0.9,
      }),
      promptVersion: env.PROMPT_VERSION,
      rubricVersion: env.RUBRIC_VERSION,
      rulesVersion: env.RULES_VERSION,
      createdBy: actorId,
    });
    if (createErrors?.length || !evaluation) {
      throw new Error(`Failed to persist evaluation: ${createErrors?.[0]?.message ?? 'unknown'}`);
    }

    await setStatus(useCaseId, 'PENDING_REVIEW', { currentEvaluationId: evaluation.id });
    await recordStatusEvent({
      useCaseId,
      actorId: 'evaluate-use-case',
      actorType: 'SYSTEM',
      fromStatus: 'EVALUATING',
      toStatus: 'PENDING_REVIEW',
      eventType: 'EVALUATION_COMPLETED',
      detail: `Evaluation ${evaluation.id} (${recommendation})`,
    });

    log({
      ...base,
      outcome: 'success',
      evaluationId: evaluation.id,
      recommendation,
      durationMs: Date.now() - started,
      modelId: env.BEDROCK_MODEL_ID,
      promptVersion: env.PROMPT_VERSION,
      rubricVersion: env.RUBRIC_VERSION,
      rulesVersion: env.RULES_VERSION,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
    });
    return { ok: true, evaluationId: evaluation.id, status: 'PENDING_REVIEW' };
  } catch (error) {
    const message = (error as Error)?.message ?? 'Unknown error';
    log({
      ...base,
      outcome: 'error',
      errorClass: (error as Error)?.name ?? 'Error',
      durationMs: Date.now() - started,
      // Controlled diagnostic only — no prompts or raw model output (§15, §19).
      detail: message.slice(0, 500),
    });
    try {
      await setStatus(useCaseId, 'EVALUATION_FAILED');
      await recordStatusEvent({
        useCaseId,
        actorId: 'evaluate-use-case',
        actorType: 'SYSTEM',
        fromStatus: 'EVALUATING',
        toStatus: 'EVALUATION_FAILED',
        eventType: 'EVALUATION_FAILED',
        detail: message.slice(0, 500),
      });
    } catch (persistError) {
      log({ ...base, outcome: 'failure_persist_error', detail: String(persistError).slice(0, 500) });
    }
    return {
      ok: false,
      status: 'EVALUATION_FAILED',
      error: 'The evaluation could not be completed. You can retry the assessment.',
    };
  }
};
