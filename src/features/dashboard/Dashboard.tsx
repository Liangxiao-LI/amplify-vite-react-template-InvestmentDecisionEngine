import { useEffect, useState } from 'react';
import { client, type UseCase, type UseCaseStatus } from '../../lib/amplify-client';
import { STATUS_LABELS } from '../../lib/workflow';
import { StatusBadge } from '../../components/StatusBadge';

interface DashboardProps {
  onOpen: (id: string) => void;
}

const SUMMARY_ORDER: UseCaseStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'EVALUATING',
  'PENDING_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'REJECTED',
  'EVALUATION_FAILED',
];

/**
 * Portfolio dashboard (§2, §11): use cases visible to the signed-in user
 * (own proposals for requesters; the full portfolio for reviewers).
 */
export function Dashboard({ onOpen }: DashboardProps) {
  const [useCases, setUseCases] = useState<UseCase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const subscription = client.models.UseCase.observeQuery().subscribe({
      next: ({ items }) => {
        setUseCases(
          [...items].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')),
        );
        setLoading(false);
      },
      error: () => setLoading(false),
    });
    return () => subscription.unsubscribe();
  }, []);

  const counts = useCases.reduce<Partial<Record<UseCaseStatus, number>>>((acc, item) => {
    if (item.status) acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section>
      <h2>Portfolio dashboard</h2>
      <div className="stat-grid">
        {SUMMARY_ORDER.map((status) => (
          <div key={status} className="stat-tile">
            <div className="stat-value">{counts[status] ?? 0}</div>
            <div className="stat-label muted">{STATUS_LABELS[status]}</div>
          </div>
        ))}
      </div>

      <h3>Recent activity</h3>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : useCases.length === 0 ? (
        <div className="card empty-state">
          <p>No use cases visible yet.</p>
        </div>
      ) : (
        <ul className="item-list">
          {useCases.slice(0, 10).map((useCase) => (
            <li key={useCase.id} className="item-row" onClick={() => onOpen(useCase.id)}>
              <div>
                <div className="item-title">{useCase.title}</div>
                <div className="item-sub muted">
                  Updated {useCase.updatedAt ? new Date(useCase.updatedAt).toLocaleString() : '—'}
                </div>
              </div>
              <StatusBadge status={useCase.status} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
