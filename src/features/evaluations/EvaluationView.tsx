import { parseJsonField, type Evaluation } from '../../lib/amplify-client';
import { RECOMMENDATION_LABELS } from '../../lib/workflow';
import { ScoreCard } from '../../components/ScoreCard';

interface PolicyReference {
  title: string;
  section?: string;
  referenceId?: string;
}

interface DeterministicFlag {
  ruleId: string;
  severity: string;
  message: string;
}

const SCORE_LABELS: Array<{ key: string; label: string; risk?: boolean }> = [
  { key: 'businessValue', label: 'Business value' },
  { key: 'technicalFeasibility', label: 'Technical feasibility' },
  { key: 'dataReadiness', label: 'Data readiness' },
  { key: 'securityAndPrivacyRisk', label: 'Security & privacy', risk: true },
  { key: 'responsibleAiRisk', label: 'Responsible AI', risk: true },
];

const RECOMMENDATION_CLASS: Record<string, string> = {
  PROCEED: 'badge-success',
  PROCEED_WITH_CONTROLS: 'badge-info',
  REVISE_AND_RESUBMIT: 'badge-warning',
  DO_NOT_PROCEED: 'badge-danger',
  SPECIALIST_REVIEW_REQUIRED: 'badge-warning',
};

/**
 * AI decision-support assessment display (§11). Clearly labeled as
 * advisory — the reviewer decision is rendered separately (ADR-007).
 */
export function EvaluationView({ evaluation }: { evaluation: Evaluation }) {
  const scores = parseJsonField<Record<string, number>>(evaluation.scores) ?? {};
  const policyReferences = parseJsonField<PolicyReference[]>(evaluation.policyReferences) ?? [];
  const flags = parseJsonField<DeterministicFlag[]>(evaluation.deterministicFlags) ?? [];

  return (
    <div className="card evaluation">
      <div className="section-header">
        <h3>AI assessment (advisory)</h3>
        {evaluation.recommendation && (
          <span className={`badge ${RECOMMENDATION_CLASS[evaluation.recommendation] ?? 'badge-neutral'}`}>
            {RECOMMENDATION_LABELS[evaluation.recommendation] ?? evaluation.recommendation}
          </span>
        )}
      </div>

      <div className="overall-score">
        <span className="overall-score-value">{evaluation.overallScore ?? '—'}</span>
        <span className="muted">/ 100 overall</span>
      </div>

      {evaluation.summary && <p>{evaluation.summary}</p>}
      {evaluation.recommendedPattern && (
        <p className="muted">Recommended pattern: {evaluation.recommendedPattern}</p>
      )}

      <div className="score-grid">
        {SCORE_LABELS.map(
          ({ key, label, risk }) =>
            typeof scores[key] === 'number' && (
              <ScoreCard key={key} label={label} score={scores[key]} isRiskCategory={risk} />
            ),
        )}
      </div>

      {(evaluation.requiredControls?.length ?? 0) > 0 && (
        <div className="evaluation-block">
          <h4>Required controls</h4>
          <ul className="bullet-list">
            {evaluation.requiredControls?.map(
              (control) => control && <li key={control}>{control}</li>,
            )}
          </ul>
        </div>
      )}

      {(evaluation.missingInformation?.length ?? 0) > 0 && (
        <div className="evaluation-block">
          <h4>Missing information</h4>
          <ul className="bullet-list">
            {evaluation.missingInformation?.map((item) => item && <li key={item}>{item}</li>)}
          </ul>
        </div>
      )}

      {flags.length > 0 && (
        <div className="evaluation-block">
          <h4>Deterministic policy findings</h4>
          <ul className="bullet-list">
            {flags.map((flag) => (
              <li key={flag.ruleId}>
                <strong>{flag.ruleId}</strong> ({flag.severity}): {flag.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {policyReferences.length > 0 && (
        <div className="evaluation-block">
          <h4>Policy references</h4>
          <ul className="bullet-list">
            {policyReferences.map((ref, index) => (
              <li key={`${ref.referenceId ?? index}`}>
                {ref.title}
                {ref.section ? ` — ${ref.section}` : ''}
                {ref.referenceId ? ` [${ref.referenceId}]` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="evaluation-meta muted">
        Model {evaluation.modelId ?? '—'} · prompt v{evaluation.promptVersion ?? '—'} · rubric v
        {evaluation.rubricVersion ?? '—'} · rules v{evaluation.rulesVersion ?? '—'} ·{' '}
        {evaluation.createdAt ? new Date(evaluation.createdAt).toLocaleString() : ''}
      </div>
    </div>
  );
}
