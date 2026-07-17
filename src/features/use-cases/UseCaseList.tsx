import { useEffect, useState } from 'react';
import { client, type UseCase } from '../../lib/amplify-client';
import { StatusBadge } from '../../components/StatusBadge';

interface UseCaseListProps {
  userId: string;
  onOpen: (id: string) => void;
  onCreate: () => void;
}

/** Requester view: the use cases the signed-in user owns (§7, §11). */
export function UseCaseList({ userId, onOpen, onCreate }: UseCaseListProps) {
  const [useCases, setUseCases] = useState<UseCase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const subscription = client.models.UseCase.observeQuery().subscribe({
      next: ({ items }) => {
        // Authorization already limits visibility; keep only owned items so
        // reviewers see their own proposals here, not the whole portfolio.
        setUseCases(
          items
            .filter((item) => item.owner?.startsWith(userId))
            .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')),
        );
        setLoading(false);
      },
      error: () => setLoading(false),
    });
    return () => subscription.unsubscribe();
  }, [userId]);

  return (
    <section>
      <div className="section-header">
        <h2>My use cases</h2>
        <button onClick={onCreate}>+ New use case</button>
      </div>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : useCases.length === 0 ? (
        <div className="card empty-state">
          <p>No use cases yet. Create your first GenAI use-case proposal.</p>
          <button onClick={onCreate}>+ New use case</button>
        </div>
      ) : (
        <ul className="item-list">
          {useCases.map((useCase) => (
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
