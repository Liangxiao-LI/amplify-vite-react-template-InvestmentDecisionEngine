import { client, type Decision, type UseCase, type UseCaseStatus } from './amplify-client';

/**
 * Workflow helpers: status labels and the state transitions a user can
 * trigger from the UI. Sensitive transitions (evaluation) run in the
 * backend function; these helpers cover requester/reviewer actions (§7, §11).
 */

export const STATUS_LABELS: Record<UseCaseStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  EVALUATING: 'Evaluating',
  EVALUATION_FAILED: 'Evaluation failed',
  PENDING_REVIEW: 'Pending review',
  CHANGES_REQUESTED: 'Changes requested',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  ARCHIVED: 'Archived',
};

export const RECOMMENDATION_LABELS: Record<string, string> = {
  PROCEED: 'Proceed',
  PROCEED_WITH_CONTROLS: 'Proceed with controls',
  REVISE_AND_RESUBMIT: 'Revise and resubmit',
  DO_NOT_PROCEED: 'Do not proceed',
  SPECIALIST_REVIEW_REQUIRED: 'Specialist review required',
};

async function recordStatusEvent(params: {
  useCaseId: string;
  actorId: string;
  fromStatus: string;
  toStatus: string;
  eventType: string;
  detail?: string;
}) {
  await client.models.StatusEvent.create({ ...params, actorType: 'USER' });
}

/** Requester submits a draft (or resubmits after requested changes). */
export async function submitUseCase(useCase: UseCase, actorId: string): Promise<string | null> {
  const { errors } = await client.models.UseCase.update({
    id: useCase.id,
    status: 'SUBMITTED',
    submittedAt: new Date().toISOString(),
  });
  if (errors?.length) return errors[0].message;
  await recordStatusEvent({
    useCaseId: useCase.id,
    actorId,
    fromStatus: useCase.status ?? 'DRAFT',
    toStatus: 'SUBMITTED',
    eventType: 'SUBMITTED',
  });
  return null;
}

/** Start the backend evaluation (protected mutation). */
export async function startEvaluation(
  useCaseId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data, errors } = await client.mutations.evaluateUseCase({ useCaseId });
  if (errors?.length) return { ok: false, error: errors[0].message };
  const result = (typeof data === 'string' ? JSON.parse(data) : data) as {
    ok: boolean;
    error?: string;
  } | null;
  if (!result) return { ok: false, error: 'No response from the evaluation service.' };
  return { ok: result.ok, error: result.error };
}

/** Reviewer records the final human decision (stored separately, ADR-007). */
export async function recordDecision(params: {
  useCase: UseCase;
  reviewerId: string;
  decision: Decision;
  comment: string;
  conditions: string[];
}): Promise<string | null> {
  const { useCase, reviewerId, decision, comment, conditions } = params;

  const { errors: decisionErrors } = await client.models.ReviewerDecision.create({
    useCaseId: useCase.id,
    evaluationId: useCase.currentEvaluationId ?? undefined,
    reviewerId,
    decision,
    comment,
    conditions,
  });
  if (decisionErrors?.length) return decisionErrors[0].message;

  const nextStatus: UseCaseStatus =
    decision === 'APPROVED' ? 'APPROVED' : decision === 'REJECTED' ? 'REJECTED' : 'CHANGES_REQUESTED';

  const { errors: statusErrors } = await client.models.UseCase.update({
    id: useCase.id,
    status: nextStatus,
  });
  if (statusErrors?.length) return statusErrors[0].message;

  await recordStatusEvent({
    useCaseId: useCase.id,
    actorId: reviewerId,
    fromStatus: useCase.status ?? 'PENDING_REVIEW',
    toStatus: nextStatus,
    eventType: 'DECISION_RECORDED',
    detail: comment ? comment.slice(0, 300) : undefined,
  });
  return null;
}
