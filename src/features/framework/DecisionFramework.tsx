import { useEffect, useState } from 'react';
import { RULE_CATALOG } from '../../../amplify/functions/evaluate-use-case/rules';
import { buildSystemPrompt } from '../../../amplify/functions/evaluate-use-case/prompt';
import {
  APPROVED_MODELS,
  PROMPT_VERSION,
  RUBRIC_VERSION,
  RULES_VERSION,
  DEFAULT_MODEL_ID,
} from '../../../amplify/functions/evaluate-use-case/versions';
import { FEATURE_CATALOG } from '../../../amplify/functions/evaluate-use-case/features';
import {
  MIN_GOLDEN,
  type Scorecard,
} from '../../../amplify/functions/evaluate-use-case/model';
import { SCORE_CATEGORIES } from '../../../amplify/functions/evaluate-use-case/types';
import { getPlatformConfig } from '../../lib/admin';
import { loadFittedScorecard } from '../../lib/scoring';
import { ServiceTrace } from '../../components/ServiceTrace';

/**
 * "How it works" — the single source of truth for the two questions
 * stakeholders ask (architecture.md §9):
 *   1. How the engine determines whether a use case should be approved.
 *   2. How the LLM has been configured / prompted to make the recommendation.
 * The rules, system prompt, and versions are imported from the same backend
 * modules the Lambda uses, so this page can never drift from production.
 */

const RUBRIC = [
  { key: 'businessValue', label: 'Business value', desc: 'Value, strategic alignment, measurable outcomes, user benefit.' },
  { key: 'technicalFeasibility', label: 'Technical feasibility', desc: 'Implementation complexity, integration readiness, operability.' },
  { key: 'dataReadiness', label: 'Data readiness', desc: 'Availability, quality, permissions, classification, lifecycle.' },
  { key: 'securityAndPrivacyRisk', label: 'Security & privacy risk', desc: 'Exposure, sensitive data, retention, external processing. Higher = lower risk.' },
  { key: 'responsibleAiRisk', label: 'Responsible-AI risk', desc: 'Human impact, fairness, explainability, oversight. Higher = lower risk.' },
];

const RECOMMENDATIONS = [
  'PROCEED',
  'PROCEED_WITH_CONTROLS',
  'REVISE_AND_RESUBMIT',
  'SPECIALIST_REVIEW_REQUIRED',
  'DO_NOT_PROCEED',
];

const DIM_ABBR: Record<string, string> = {
  businessValue: 'BV',
  technicalFeasibility: 'TF',
  dataReadiness: 'DR',
  securityAndPrivacyRisk: 'S&P',
  responsibleAiRisk: 'RAI',
};

function fmtEffect(value: number): string {
  if (value === 0) return '·';
  return `${value > 0 ? '+' : ''}${value}`;
}

export function DecisionFramework() {
  const [activeModelId, setActiveModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [fit, setFit] = useState<{ model: Scorecard | null; sampleCount: number } | null>(null);

  useEffect(() => {
    getPlatformConfig()
      .then((config) => {
        if (config?.activeModelId) setActiveModelId(config.activeModelId);
      })
      .catch(() => {
        /* fall back to default label */
      });
    loadFittedScorecard()
      .then(setFit)
      .catch(() => {
        /* golden data unavailable; the section shows the cold-start state */
      });
  }, []);

  const activeModel =
    APPROVED_MODELS.find((m) => m.id === activeModelId) ??
    APPROVED_MODELS.find((m) => m.id === DEFAULT_MODEL_ID)!;
  const systemPrompt = buildSystemPrompt(RUBRIC_VERSION);

  const model = fit?.model ?? null;
  const sampleCount = fit?.sampleCount ?? 0;
  const modelActive = model !== null;
  // Only show features that actually move a score, to keep the table readable.
  const activeFeatures = model
    ? FEATURE_CATALOG.filter((f) =>
        SCORE_CATEGORIES.some((dim) => (model.effects[dim]?.[f.key] ?? 0) !== 0),
      )
    : [];

  return (
    <section>
      <h2>How the decision engine works</h2>
      <p className="muted">
        The AI produces an <strong>advisory recommendation</strong>. The engine constrains it with
        deterministic rules, and an accountable human reviewer makes the final decision.
      </p>

      {/* Question 1 — how approval is determined */}
      <div className="card">
        <h3>1 · How approval is determined</h3>
        <ol className="framework-flow">
          <li>
            <strong>Deterministic rules run first</strong> — hard policy checks in code (below) that
            can cap the recommendation regardless of what the model says.
          </li>
          <li>
            <strong>LLM scores the proposal</strong> across five rubric categories and proposes one
            of {RECOMMENDATIONS.length} controlled recommendations.
          </li>
          <li>
            <strong>A human reviewer decides</strong> — approve, reject, or request changes. This is
            stored separately from the AI output and is authoritative.
          </li>
        </ol>

        <h4>Deterministic rules (rules v{RULES_VERSION})</h4>
        <table className="framework-table">
          <thead>
            <tr>
              <th>Rule</th>
              <th>Condition</th>
              <th>Consequence</th>
            </tr>
          </thead>
          <tbody>
            {RULE_CATALOG.map((rule) => (
              <tr key={rule.ruleId}>
                <td><code>{rule.ruleId}</code></td>
                <td>{rule.condition}</td>
                <td>{rule.consequence}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h4>Scoring rubric (rubric v{RUBRIC_VERSION})</h4>
        <ul className="bullet-list">
          {RUBRIC.map((r) => (
            <li key={r.key}>
              <strong>{r.label}</strong> — {r.desc}
            </li>
          ))}
        </ul>

        <h4>Controlled recommendations</h4>
        <div className="chip-row">
          {RECOMMENDATIONS.map((r) => (
            <span key={r} className="badge badge-neutral">{r}</span>
          ))}
        </div>
        <p className="muted">
          Any value outside this set is rejected by schema validation and never stored.
        </p>
      </div>

      {/* Question 2 — how the LLM is configured / prompted */}
      <div className="card">
        <h3>2 · How the LLM is configured & prompted</h3>
        <dl className="detail-grid">
          <div>
            <dt>Active model</dt>
            <dd>{activeModel.label} <span className="muted">({activeModel.id})</span></dd>
          </div>
          <div>
            <dt>Inference settings</dt>
            <dd>temperature 0.2 · topP 0.9 (conservative, for repeatability)</dd>
          </div>
          <div>
            <dt>Prompt version</dt>
            <dd>v{PROMPT_VERSION}</dd>
          </div>
          <div>
            <dt>Output contract</dt>
            <dd>Strict JSON, schema-validated before persistence</dd>
          </div>
        </dl>
        <h4>Exact system prompt sent to the model</h4>
        <pre className="prompt-block">{systemPrompt}</pre>
        <p className="muted">
          The proposal text is passed as untrusted data between explicit markers; the model is
          instructed never to follow instructions found inside it (prompt-injection defense).
        </p>
      </div>

      {/* Question 3 — the supervised scoring model */}
      <div className="card">
        <h3>3 · Supervised scoring model (learns from senior reviewers)</h3>
        <p className="muted">
          Senior human scores are captured as <strong>golden labels</strong> (absolute truth). When
          at least {MIN_GOLDEN} exist, an interpretable weighted scorecard is fit on the fly and
          takes over the five dimension scores, so the AI scores track senior judgement and can
          explain <em>why</em>. Below {MIN_GOLDEN}, the LLM scores are used (cold start).
        </p>

        <div className="model-status">
          <span className={`badge ${modelActive ? 'badge-gold' : 'badge-neutral'}`}>
            {modelActive ? 'Model active' : 'Cold start'}
          </span>
          <span className="muted">
            {sampleCount} golden sample{sampleCount === 1 ? '' : 's'} · threshold {MIN_GOLDEN}
          </span>
        </div>

        <h4>Method</h4>
        <ul className="bullet-list">
          <li>
            <code>baseline_d = mean(golden score_d)</code> — the per-dimension prior.
          </li>
          <li>
            <code>effect_&#123;d,f&#125; = (mean(score_d | f=1) − baseline_d) × n1/(n1+K)</code>, with
            shrinkage <code>K=3</code> so effects from few samples are damped toward zero.
          </li>
          <li>
            <code>score_d = clamp(round(baseline_d + Σ active effects), 0, 100)</code>; the summed
            effects are the "why". Overall is the mean of the five scores.
          </li>
          <li>
            Features are <strong>structured only</strong> (form fields + deterministic-rule hits) —
            no extra model call. This is a marginal feature-effect model, not a joint regression, so
            correlated features can double-count; treat early predictions as directional.
          </li>
        </ul>

        <h4>Feature catalog ({FEATURE_CATALOG.length} features)</h4>
        <table className="framework-table">
          <thead>
            <tr>
              <th>Feature</th>
              <th>Group</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            {FEATURE_CATALOG.map((f) => (
              <tr key={f.key}>
                <td><code>{f.key}</code></td>
                <td>{f.group}</td>
                <td>{f.description}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h4>Current fitted coefficients</h4>
        {modelActive && model ? (
          <div className="table-scroll">
            <table className="framework-table coefficient-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  {SCORE_CATEGORIES.map((dim) => (
                    <th key={dim} title={dim}>{DIM_ABBR[dim] ?? dim}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="baseline-row">
                  <td><strong>Baseline (mean)</strong></td>
                  {SCORE_CATEGORIES.map((dim) => (
                    <td key={dim}><strong>{model.baselines[dim]}</strong></td>
                  ))}
                </tr>
                {activeFeatures.map((f) => (
                  <tr key={f.key}>
                    <td>{f.label}</td>
                    {SCORE_CATEGORIES.map((dim) => {
                      const effect = model.effects[dim]?.[f.key] ?? 0;
                      return (
                        <td
                          key={dim}
                          className={effect > 0 ? 'pos' : effect < 0 ? 'neg' : 'muted'}
                        >
                          {fmtEffect(effect)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted">
              BV business value · TF technical feasibility · DR data readiness · S&amp;P security &amp;
              privacy · RAI responsible-AI. Only features with a non-zero effect are shown.
            </p>
          </div>
        ) : (
          <p className="muted">
            The model is in cold start ({sampleCount} of {MIN_GOLDEN} golden samples). Coefficients
            appear once enough senior golden labels have been recorded.
          </p>
        )}
      </div>

      <ServiceTrace />
    </section>
  );
}
