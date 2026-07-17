import { useState, type FormEvent } from 'react';
import type { Decision, UseCase } from '../../lib/amplify-client';
import { recordDecision } from '../../lib/workflow';

interface DecisionFormProps {
  useCase: UseCase;
  reviewerId: string;
  onDecided: () => void;
}

/** Reviewer decision: the authoritative human step (§7, ADR-007). */
export function DecisionForm({ useCase, reviewerId, onDecided }: DecisionFormProps) {
  const [decision, setDecision] = useState<Decision>('APPROVED');
  const [comment, setComment] = useState('');
  const [conditions, setConditions] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (comment.trim().length === 0) {
      setError('A review comment is required.');
      return;
    }
    setSaving(true);
    const failure = await recordDecision({
      useCase,
      reviewerId,
      decision,
      comment: comment.trim().slice(0, 4000),
      conditions: conditions
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    });
    setSaving(false);
    if (failure) {
      setError(failure);
    } else {
      onDecided();
    }
  }

  return (
    <form className="card decision-form" onSubmit={handleSubmit}>
      <h3>Reviewer decision</h3>
      <p className="muted">
        The AI assessment above is advisory. Your decision is the final,
        accountable outcome and is stored separately.
      </p>

      <label>
        Decision
        <select value={decision} onChange={(e) => setDecision(e.target.value as Decision)}>
          <option value="APPROVED">Approve</option>
          <option value="CHANGES_REQUESTED">Request changes</option>
          <option value="REJECTED">Reject</option>
        </select>
      </label>

      <label>
        Comment *
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          maxLength={4000}
          required
        />
      </label>

      <label>
        Conditions (one per line, optional)
        <textarea value={conditions} onChange={(e) => setConditions(e.target.value)} rows={2} />
      </label>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="form-actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Recording…' : 'Record decision'}
        </button>
      </div>
    </form>
  );
}
