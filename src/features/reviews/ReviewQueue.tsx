import { useEffect, useState } from 'react';
import { client, type UseCase } from '../../lib/amplify-client';
import { StatusBadge } from '../../components/StatusBadge';

interface ReviewQueueProps {
  onOpen: (id: string) => void;
}

/** Reviewer queue: submitted use cases awaiting a human decision (§11). */
export function ReviewQueue({ onOpen }: ReviewQueueProps) {
  const [items, setItems] = useState<UseCase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const subscription = client.models.UseCase.observeQuery({
      filter: { status: { eq: 'PENDING_REVIEW' } },
    }).subscribe({
      next: ({ items: results }) => {
        setItems(
          [...results].sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? '')),
        );
        setLoading(false);
      },
      error: () => setLoading(false),
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <section>
      <div className="section-header">
        <h2>Review queue</h2>
        <span className="muted">{items.length} pending</span>
      </div>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <div className="card empty-state">
          <p>No use cases are waiting for review.</p>
        </div>
      ) : (
        <ul className="item-list">
          {items.map((useCase) => (
            <li key={useCase.id} className="item-row" onClick={() => onOpen(useCase.id)}>
              <div>
                <div className="item-title">{useCase.title}</div>
                <div className="item-sub muted">
                  Submitted{' '}
                  {useCase.submittedAt ? new Date(useCase.submittedAt).toLocaleString() : '—'}
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
