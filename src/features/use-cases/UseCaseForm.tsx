import { useState, type FormEvent } from 'react';
import { client, type UseCase } from '../../lib/amplify-client';

interface UseCaseFormProps {
  userId: string;
  /** When set, the form edits an existing draft instead of creating one. */
  existing?: UseCase;
  onSaved: (id: string) => void;
  onCancel: () => void;
}

const CLASSIFICATIONS = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'] as const;

/** Structured use-case proposal form (architecture.md §8, §11). */
export function UseCaseForm({ userId, existing, onSaved, onCancel }: UseCaseFormProps) {
  const [title, setTitle] = useState(existing?.title ?? '');
  const [businessProblem, setBusinessProblem] = useState(existing?.businessProblem ?? '');
  const [targetUsers, setTargetUsers] = useState((existing?.targetUsers ?? []).join(', '));
  const [expectedOutcome, setExpectedOutcome] = useState(existing?.expectedOutcome ?? '');
  const [successMetrics, setSuccessMetrics] = useState(
    (existing?.successMetrics ?? []).join('\n'),
  );
  const [proposedCapability, setProposedCapability] = useState(
    existing?.proposedCapability ?? '',
  );
  const [dataSources, setDataSources] = useState((existing?.dataSources ?? []).join('\n'));
  const [dataClassification, setDataClassification] = useState(
    existing?.dataClassification ?? 'INTERNAL',
  );
  const [externalFacing, setExternalFacing] = useState(existing?.externalFacing ?? false);
  const [humanOversight, setHumanOversight] = useState(existing?.humanOversight ?? true);
  const [estimatedMonthlyVolume, setEstimatedMonthlyVolume] = useState(
    existing?.estimatedMonthlyVolume?.toString() ?? '',
  );
  const [riskConcerns, setRiskConcerns] = useState(existing?.riskConcerns ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const splitLines = (value: string) =>
    value
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    // Field-level validation before any persistence (§13, §19).
    if (title.trim().length < 3 || title.length > 200) {
      setError('Title must be between 3 and 200 characters.');
      return;
    }
    if (businessProblem.trim().length < 10 || businessProblem.length > 5000) {
      setError('Business problem must be between 10 and 5000 characters.');
      return;
    }
    const volume = estimatedMonthlyVolume.trim()
      ? Number(estimatedMonthlyVolume)
      : null;
    if (volume !== null && (!Number.isFinite(volume) || volume < 0)) {
      setError('Estimated monthly volume must be a non-negative number.');
      return;
    }

    setSaving(true);
    const fields = {
      title: title.trim(),
      businessProblem: businessProblem.trim(),
      targetUsers: splitLines(targetUsers),
      expectedOutcome: expectedOutcome.trim(),
      successMetrics: splitLines(successMetrics),
      proposedCapability: proposedCapability.trim(),
      dataSources: splitLines(dataSources),
      dataClassification: dataClassification as (typeof CLASSIFICATIONS)[number],
      externalFacing,
      humanOversight,
      estimatedMonthlyVolume: volume,
      riskConcerns: riskConcerns.trim(),
    };

    try {
      if (existing) {
        const { errors } = await client.models.UseCase.update({ id: existing.id, ...fields });
        if (errors?.length) throw new Error(errors[0].message);
        onSaved(existing.id);
      } else {
        const { data, errors } = await client.models.UseCase.create({
          ...fields,
          status: 'DRAFT',
        });
        if (errors?.length || !data) throw new Error(errors?.[0]?.message ?? 'Create failed');
        await client.models.StatusEvent.create({
          useCaseId: data.id,
          actorId: userId,
          actorType: 'USER',
          fromStatus: '',
          toStatus: 'DRAFT',
          eventType: 'CREATED',
        });
        onSaved(data.id);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card form" onSubmit={handleSubmit}>
      <h2>{existing ? 'Edit draft' : 'New GenAI use case'}</h2>

      <label>
        Title *
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
      </label>

      <label>
        Business problem *
        <textarea
          value={businessProblem}
          onChange={(e) => setBusinessProblem(e.target.value)}
          rows={4}
          maxLength={5000}
          required
        />
      </label>

      <div className="form-row">
        <label>
          Target users (comma separated)
          <input value={targetUsers} onChange={(e) => setTargetUsers(e.target.value)} />
        </label>
        <label>
          Proposed capability
          <input
            value={proposedCapability}
            onChange={(e) => setProposedCapability(e.target.value)}
            placeholder="e.g. Internal retrieval-augmented assistant"
          />
        </label>
      </div>

      <label>
        Expected outcome
        <textarea
          value={expectedOutcome}
          onChange={(e) => setExpectedOutcome(e.target.value)}
          rows={2}
          maxLength={2000}
        />
      </label>

      <div className="form-row">
        <label>
          Success metrics (one per line)
          <textarea
            value={successMetrics}
            onChange={(e) => setSuccessMetrics(e.target.value)}
            rows={3}
          />
        </label>
        <label>
          Data sources (one per line)
          <textarea value={dataSources} onChange={(e) => setDataSources(e.target.value)} rows={3} />
        </label>
      </div>

      <div className="form-row">
        <label>
          Data classification
          <select
            value={dataClassification ?? 'INTERNAL'}
            onChange={(e) => setDataClassification(e.target.value as (typeof CLASSIFICATIONS)[number])}
          >
            {CLASSIFICATIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          Estimated monthly volume
          <input
            type="number"
            min={0}
            value={estimatedMonthlyVolume}
            onChange={(e) => setEstimatedMonthlyVolume(e.target.value)}
          />
        </label>
      </div>

      <div className="form-row checkboxes">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={externalFacing ?? false}
            onChange={(e) => setExternalFacing(e.target.checked)}
          />
          External-facing output
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={humanOversight ?? true}
            onChange={(e) => setHumanOversight(e.target.checked)}
          />
          Human oversight planned
        </label>
      </div>

      <label>
        Known risk concerns
        <textarea
          value={riskConcerns}
          onChange={(e) => setRiskConcerns(e.target.value)}
          rows={2}
          maxLength={2000}
        />
      </label>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="form-actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : existing ? 'Save changes' : 'Create draft'}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
