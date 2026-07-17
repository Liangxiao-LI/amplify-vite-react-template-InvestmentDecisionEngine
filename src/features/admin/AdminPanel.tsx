import { useEffect, useState } from 'react';
import { client, type UseCase } from '../../lib/amplify-client';
import { APPROVED_MODELS, DEFAULT_MODEL_ID } from '../../../amplify/functions/evaluate-use-case/versions';
import {
  getPlatformConfig,
  seedDemoData,
  setActiveModel,
  setEvaluationsEnabled,
} from '../../lib/admin';
import { StatusBadge } from '../../components/StatusBadge';

interface AdminPanelProps {
  adminId: string;
  onOpen: (id: string) => void;
}

/**
 * Administrator console (architecture.md §7): see ALL use cases across every
 * user, seed historical demo data, choose which Bedrock model generates the
 * decision card, and toggle the evaluation feature flag.
 */
export function AdminPanel({ adminId, onOpen }: AdminPanelProps) {
  const [allUseCases, setAllUseCases] = useState<UseCase[]>([]);
  const [activeModelId, setActiveModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [evaluationsEnabled, setEvalsEnabled] = useState<boolean>(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const subscription = client.models.UseCase.observeQuery().subscribe({
      next: ({ items }) => {
        setAllUseCases(
          [...items].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')),
        );
      },
    });
    getPlatformConfig()
      .then((config) => {
        if (config?.activeModelId) setActiveModelId(config.activeModelId);
        if (typeof config?.evaluationsEnabled === 'boolean') setEvalsEnabled(config.evaluationsEnabled);
      })
      .catch(() => undefined);
    return () => subscription.unsubscribe();
  }, []);

  async function handleSeed() {
    setBusy('seed');
    setMessage(null);
    setError(null);
    const result = await seedDemoData();
    if ('error' in result) setError(result.error);
    else setMessage(result.message);
    setBusy(null);
  }

  async function handleModelChange(modelId: string) {
    setActiveModelId(modelId);
    setBusy('model');
    setError(null);
    setMessage(null);
    const failure = await setActiveModel(modelId, adminId);
    if (failure) setError(failure);
    else setMessage('Active model updated. It applies to the next assessment.');
    setBusy(null);
  }

  async function handleToggleEvals(next: boolean) {
    setEvalsEnabled(next);
    setBusy('toggle');
    setError(null);
    const failure = await setEvaluationsEnabled(next, adminId);
    if (failure) setError(failure);
    else setMessage(next ? 'Evaluations enabled.' : 'Evaluations disabled.');
    setBusy(null);
  }

  return (
    <section>
      <h2>Administrator console</h2>

      {message && <div className="alert alert-info">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <h3>Model used to generate the decision card</h3>
        <p className="muted">
          The evaluate Lambda validates this against the approved allow-list before use.
        </p>
        <div className="model-options">
          {APPROVED_MODELS.map((model) => (
            <label key={model.id} className={`model-option ${activeModelId === model.id ? 'model-active' : ''}`}>
              <input
                type="radio"
                name="activeModel"
                checked={activeModelId === model.id}
                disabled={busy !== null}
                onChange={() => handleModelChange(model.id)}
              />
              <span>
                <strong>{model.label}</strong>
                <span className="muted"> — {model.note}</span>
                <br />
                <code className="muted">{model.id}</code>
              </span>
            </label>
          ))}
        </div>
        <label className="checkbox toggle-row">
          <input
            type="checkbox"
            checked={evaluationsEnabled}
            disabled={busy !== null}
            onChange={(e) => handleToggleEvals(e.target.checked)}
          />
          Evaluations enabled (master feature flag)
        </label>
      </div>

      <div className="card">
        <div className="section-header">
          <h3>Seeded historical use cases</h3>
          <button onClick={handleSeed} disabled={busy !== null}>
            {busy === 'seed' ? 'Seeding…' : 'Seed demo data'}
          </button>
        </div>
        <p className="muted">
          Inserts three historical use cases with pre-authored AI decision cards and human
          decisions. Idempotent — running it again does nothing if demo data already exists.
        </p>
      </div>

      <div className="section-header">
        <h3>All documents ({allUseCases.length})</h3>
      </div>
      <ul className="item-list">
        {allUseCases.map((useCase) => (
          <li key={useCase.id} className="item-row" onClick={() => onOpen(useCase.id)}>
            <div>
              <div className="item-title">{useCase.title}</div>
              <div className="item-sub muted">
                Owner {useCase.owner?.split('::')[1] ?? useCase.owner ?? '—'} · updated{' '}
                {useCase.updatedAt ? new Date(useCase.updatedAt).toLocaleString() : '—'}
              </div>
            </div>
            <StatusBadge status={useCase.status} />
          </li>
        ))}
      </ul>
    </section>
  );
}
