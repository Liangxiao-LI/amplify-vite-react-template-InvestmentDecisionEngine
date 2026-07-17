import { useCallback, useEffect, useState } from 'react';
import {
  client,
  type CommentRecord,
  type Evaluation,
  type ReviewerDecision,
  type StatusEvent,
  type UseCase,
} from '../../lib/amplify-client';
import { RECOMMENDATION_LABELS, startEvaluation, submitUseCase } from '../../lib/workflow';
import { StatusBadge } from '../../components/StatusBadge';
import { EvaluationView } from '../evaluations/EvaluationView';
import { DecisionForm } from '../reviews/DecisionForm';
import { UseCaseForm } from './UseCaseForm';

interface UseCaseDetailProps {
  useCaseId: string;
  userId: string;
  isReviewer: boolean;
  onBack: () => void;
}

/**
 * Use-case detail: proposal fields, AI assessment, reviewer decision,
 * comments, and the append-only status timeline (§11).
 */
export function UseCaseDetail({ useCaseId, userId, isReviewer, onBack }: UseCaseDetailProps) {
  const [useCase, setUseCase] = useState<UseCase | null>(null);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [decisions, setDecisions] = useState<ReviewerDecision[]>([]);
  const [comments, setComments] = useState<CommentRecord[]>([]);
  const [events, setEvents] = useState<StatusEvent[]>([]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState('');

  const refresh = useCallback(async () => {
    const [useCaseResult, evaluationResult, decisionResult, commentResult, eventResult] =
      await Promise.all([
        client.models.UseCase.get({ id: useCaseId }),
        client.models.Evaluation.list({ filter: { useCaseId: { eq: useCaseId } } }),
        client.models.ReviewerDecision.list({ filter: { useCaseId: { eq: useCaseId } } }),
        client.models.Comment.list({ filter: { useCaseId: { eq: useCaseId } } }),
        client.models.StatusEvent.list({ filter: { useCaseId: { eq: useCaseId } } }),
      ]);
    setUseCase(useCaseResult.data ?? null);
    const byNewest = (a: { createdAt?: string | null }, b: { createdAt?: string | null }) =>
      (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
    setEvaluations((evaluationResult.data ?? []).sort(byNewest));
    setDecisions((decisionResult.data ?? []).sort(byNewest));
    setComments((commentResult.data ?? []).sort(byNewest));
    setEvents((eventResult.data ?? []).sort(byNewest));
  }, [useCaseId]);

  useEffect(() => {
    refresh();
    // Live updates while an evaluation runs in the backend.
    const subscription = client.models.UseCase.observeQuery({
      filter: { id: { eq: useCaseId } },
    }).subscribe({
      next: ({ items }) => {
        if (items[0]) {
          setUseCase(items[0]);
          refresh();
        }
      },
    });
    return () => subscription.unsubscribe();
  }, [useCaseId, refresh]);

  if (!useCase) {
    return (
      <section>
        <button className="secondary" onClick={onBack}>
          ← Back
        </button>
        <p className="muted">Loading…</p>
      </section>
    );
  }

  if (editing) {
    return (
      <UseCaseForm
        userId={userId}
        existing={useCase}
        onSaved={() => {
          setEditing(false);
          refresh();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const isOwner = !!useCase.owner && useCase.owner.startsWith(userId);
  const canEdit = isOwner && (useCase.status === 'DRAFT' || useCase.status === 'CHANGES_REQUESTED');
  const canSubmit = canEdit;
  const canEvaluate =
    (isOwner || isReviewer) &&
    (useCase.status === 'SUBMITTED' || useCase.status === 'EVALUATION_FAILED');
  const canDecide = isReviewer && useCase.status === 'PENDING_REVIEW';
  const currentEvaluation =
    evaluations.find((item) => item.id === useCase.currentEvaluationId) ?? evaluations[0];

  async function handleSubmitForEvaluation() {
    if (!useCase) return;
    setBusy('submit');
    setError(null);
    const failure = await submitUseCase(useCase, userId);
    if (failure) setError(failure);
    await refresh();
    setBusy(null);
  }

  async function handleEvaluate() {
    setBusy('evaluate');
    setError(null);
    const result = await startEvaluation(useCaseId);
    if (!result.ok) setError(result.error ?? 'Evaluation failed.');
    await refresh();
    setBusy(null);
  }

  async function handleAddComment() {
    const body = commentDraft.trim();
    if (!body) return;
    setBusy('comment');
    await client.models.Comment.create({
      useCaseId,
      authorId: userId,
      body: body.slice(0, 4000),
      visibility: 'ALL',
    });
    setCommentDraft('');
    await refresh();
    setBusy(null);
  }

  return (
    <section>
      <button className="secondary" onClick={onBack}>
        ← Back
      </button>

      <div className="card">
        <div className="section-header">
          <h2>{useCase.title}</h2>
          <StatusBadge status={useCase.status} />
        </div>

        <dl className="detail-grid">
          <div>
            <dt>Business problem</dt>
            <dd>{useCase.businessProblem}</dd>
          </div>
          {!!useCase.expectedOutcome && (
            <div>
              <dt>Expected outcome</dt>
              <dd>{useCase.expectedOutcome}</dd>
            </div>
          )}
          {(useCase.targetUsers?.length ?? 0) > 0 && (
            <div>
              <dt>Target users</dt>
              <dd>{useCase.targetUsers?.filter(Boolean).join(', ')}</dd>
            </div>
          )}
          {(useCase.successMetrics?.length ?? 0) > 0 && (
            <div>
              <dt>Success metrics</dt>
              <dd>{useCase.successMetrics?.filter(Boolean).join('; ')}</dd>
            </div>
          )}
          {!!useCase.proposedCapability && (
            <div>
              <dt>Proposed capability</dt>
              <dd>{useCase.proposedCapability}</dd>
            </div>
          )}
          {(useCase.dataSources?.length ?? 0) > 0 && (
            <div>
              <dt>Data sources</dt>
              <dd>{useCase.dataSources?.filter(Boolean).join('; ')}</dd>
            </div>
          )}
          <div>
            <dt>Data classification</dt>
            <dd>{useCase.dataClassification ?? '—'}</dd>
          </div>
          <div>
            <dt>External facing</dt>
            <dd>{useCase.externalFacing ? 'Yes' : 'No'}</dd>
          </div>
          <div>
            <dt>Human oversight</dt>
            <dd>{useCase.humanOversight ? 'Yes' : 'No'}</dd>
          </div>
          {useCase.estimatedMonthlyVolume != null && (
            <div>
              <dt>Est. monthly volume</dt>
              <dd>{useCase.estimatedMonthlyVolume}</dd>
            </div>
          )}
          {!!useCase.riskConcerns && (
            <div>
              <dt>Risk concerns</dt>
              <dd>{useCase.riskConcerns}</dd>
            </div>
          )}
        </dl>

        {error && <div className="alert alert-error">{error}</div>}
        {useCase.status === 'EVALUATING' && (
          <div className="alert alert-info">
            AI assessment in progress… this view updates automatically.
          </div>
        )}

        <div className="form-actions">
          {canEdit && (
            <button className="secondary" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
          {canSubmit && (
            <button onClick={handleSubmitForEvaluation} disabled={busy !== null}>
              {busy === 'submit' ? 'Submitting…' : 'Submit for assessment'}
            </button>
          )}
          {canEvaluate && (
            <button onClick={handleEvaluate} disabled={busy !== null}>
              {busy === 'evaluate' ? 'Running assessment…' : 'Run AI assessment'}
            </button>
          )}
        </div>
      </div>

      {currentEvaluation && <EvaluationView evaluation={currentEvaluation} />}

      {decisions.length > 0 && (
        <div className="card">
          <h3>Final decision (human)</h3>
          {decisions.map((decision) => (
            <div key={decision.id} className="decision-record">
              <div>
                <strong>{RECOMMENDATION_LABELS[decision.decision ?? ''] ?? decision.decision}</strong>{' '}
                <span className="muted">
                  {decision.createdAt ? new Date(decision.createdAt).toLocaleString() : ''}
                </span>
              </div>
              {decision.comment && <p>{decision.comment}</p>}
              {(decision.conditions?.length ?? 0) > 0 && (
                <ul className="bullet-list">
                  {decision.conditions?.map((c) => c && <li key={c}>{c}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {canDecide && (
        <DecisionForm useCase={useCase} reviewerId={userId} onDecided={refresh} />
      )}

      <div className="card">
        <h3>Comments</h3>
        {comments.length === 0 && <p className="muted">No comments yet.</p>}
        {comments.map((comment) => (
          <div key={comment.id} className="comment">
            <div className="muted">
              {comment.createdAt ? new Date(comment.createdAt).toLocaleString() : ''}
            </div>
            <p>{comment.body}</p>
          </div>
        ))}
        <div className="comment-box">
          <textarea
            value={commentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            rows={2}
            placeholder="Add a comment…"
            maxLength={4000}
          />
          <button onClick={handleAddComment} disabled={busy !== null || !commentDraft.trim()}>
            Comment
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Status history</h3>
        <ul className="timeline">
          {events.map((event) => (
            <li key={event.id}>
              <span className="timeline-time muted">
                {event.createdAt ? new Date(event.createdAt).toLocaleString() : ''}
              </span>
              <span>
                <strong>{event.eventType}</strong>
                {event.fromStatus ? ` · ${event.fromStatus} → ${event.toStatus}` : ` · ${event.toStatus}`}
                {event.actorType === 'SYSTEM' ? ' (system)' : ''}
                {event.detail ? ` — ${event.detail}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
