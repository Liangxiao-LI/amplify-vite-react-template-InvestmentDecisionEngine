import { useState } from 'react';
import { client, parseJsonField, type UseCase } from '../../lib/amplify-client';
import { featuresForUseCase, type GoldenLabel } from '../../lib/scoring';
import { overallFromDimensions } from '../../../amplify/functions/evaluate-use-case/model';
import {
  RECOMMENDATIONS,
  SCORE_CATEGORIES,
  type ScoreCategory,
} from '../../../amplify/functions/evaluate-use-case/types';
import { RECOMMENDATION_LABELS } from '../../lib/workflow';

/**
 * Senior golden-label form (architecture.md §9.5). Only rendered for
 * SENIOR_REVIEWER / ADMIN, and only once the use case has been evaluated.
 *
 * Golden labels are absolute truth and append-only: if one already exists for
 * this use case we show it read-only and block re-labelling in the UI (the data
 * model has no update/delete grant, so this is a convenience guard, not the
 * security boundary). Features are snapshotted client-side with the same pure
 * extractor the Lambda uses.
 */

const SCORE_FIELDS: Array<{ key: ScoreCategory; label: string; risk?: boolean }> = [
  { key: 'businessValue', label: 'Business value' },
  { key: 'technicalFeasibility', label: 'Technical feasibility' },
  { key: 'dataReadiness', label: 'Data readiness' },
  { key: 'securityAndPrivacyRisk', label: 'Security & privacy (higher = lower risk)', risk: true },
  { key: 'responsibleAiRisk', label: 'Responsible AI (higher = lower risk)', risk: true },
];

const DEFAULT_SCORE = 70;

interface GoldenLabelFormProps {
  useCase: UseCase;
  seniorId: string;
  existingLabels: GoldenLabel[];
  onSaved: () => void;
}

export function GoldenLabelForm({
  useCase,
  seniorId,
  existingLabels,
  onSaved,
}: GoldenLabelFormProps) {
  const initialScores = Object.fromEntries(
    SCORE_CATEGORIES.map((c) => [c, DEFAULT_SCORE]),
  ) as Record<ScoreCategory, number>;

  const [scores, setScores] = useState<Record<ScoreCategory, number>>(initialScores);
  const [recommendation, setRecommendation] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Append-only: an existing golden label is authoritative and cannot be changed.
  if (existingLabels.length > 0) {
    const label = existingLabels[0];
    const labelScores = parseJsonField<Record<string, number>>(label.scores) ?? {};
    return (
      <div className="card golden-card">
        <div className="section-header">
          <h3>Golden label (senior · absolute truth)</h3>
          <span className="badge badge-gold">Recorded</span>
        </div>
        <p className="muted">
          A senior reviewer has already recorded the golden label for this use case. Golden labels
          are append-only and cannot be changed.
        </p>
        <div className="score-grid">
          {SCORE_FIELDS.map(({ key, label: fieldLabel }) => (
            <div key={key} className="golden-score-readonly">
              <span className="muted">{fieldLabel}</span>
              <strong>{labelScores[key] ?? '—'}</strong>
            </div>
          ))}
        </div>
        <p className="muted">
          Overall {label.overallScore ?? '—'} / 100
          {label.recommendation
            ? ` · ${RECOMMENDATION_LABELS[label.recommendation] ?? label.recommendation}`
            : ''}
          {label.scoredBy ? ` · by ${label.scoredBy}` : ''}
        </p>
        {label.notes && <p>{label.notes}</p>}
      </div>
    );
  }

  function setScore(key: ScoreCategory, raw: string) {
    const value = Math.min(100, Math.max(0, Math.round(Number(raw) || 0)));
    setScores((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    const features = featuresForUseCase(useCase);
    const { errors } = await client.models.GoldenLabel.create({
      useCaseId: useCase.id,
      features: JSON.stringify(features),
      scores: JSON.stringify(scores),
      overallScore: overallFromDimensions(scores),
      recommendation: recommendation
        ? (recommendation as GoldenLabel['recommendation'])
        : undefined,
      scoredBy: seniorId,
      notes: notes.trim() ? notes.trim().slice(0, 2000) : undefined,
    });
    setBusy(false);
    if (errors?.length) {
      setError(errors[0].message);
      return;
    }
    onSaved();
  }

  const overall = overallFromDimensions(scores);

  return (
    <div className="card golden-card">
      <div className="section-header">
        <h3>Record golden label (senior)</h3>
        <span className="badge badge-gold">Ground truth</span>
      </div>
      <p className="muted">
        Your scores become <strong>absolute truth</strong> for the supervised scoring model (§9.5).
        This is append-only and cannot be edited later. Overall is the arithmetic mean of the five
        scores.
      </p>

      <div className="golden-score-inputs">
        {SCORE_FIELDS.map(({ key, label: fieldLabel, risk }) => (
          <label key={key} className={`golden-score-input${risk ? ' is-risk' : ''}`}>
            <span>{fieldLabel}</span>
            <input
              type="number"
              min={0}
              max={100}
              value={scores[key]}
              onChange={(e) => setScore(key, e.target.value)}
            />
          </label>
        ))}
      </div>

      <div className="golden-overall">
        Overall <strong>{overall}</strong> / 100
      </div>

      <label className="golden-field">
        <span>Recommendation (optional)</span>
        <select value={recommendation} onChange={(e) => setRecommendation(e.target.value)}>
          <option value="">— none —</option>
          {RECOMMENDATIONS.map((r) => (
            <option key={r} value={r}>
              {RECOMMENDATION_LABELS[r] ?? r}
            </option>
          ))}
        </select>
      </label>

      <label className="golden-field">
        <span>Notes (optional)</span>
        <textarea
          rows={2}
          value={notes}
          maxLength={2000}
          placeholder="Why these scores?"
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="form-actions">
        <button onClick={handleSubmit} disabled={busy}>
          {busy ? 'Recording…' : 'Record golden label'}
        </button>
      </div>
    </div>
  );
}
