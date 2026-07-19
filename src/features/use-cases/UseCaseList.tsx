import { useEffect, useState } from 'react';
import { client, type UseCase } from '../../lib/amplify-client';
import { StatusBadge } from '../../components/StatusBadge';

interface UseCaseListProps {
  userId: string;
  onOpen: (id: string) => void;
  onCreate: () => void;
  /** 'mine' (default) shows only owned use cases; 'all' shows the whole
   *  portfolio — reserved for admins and senior reviewers (§9.5, §11). */
  scope?: 'mine' | 'all';
}

/** Use-case list. Requesters see their own; admins/seniors can see all. */
export function UseCaseList({ userId, onOpen, onCreate, scope = 'mine' }: UseCaseListProps) {
  const [useCases, setUseCases] = useState<UseCase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const subscription = client.models.UseCase.observeQuery().subscribe({
      next: ({ items }) => {
        // Backend authorization already limits what each role can read. In
        // 'mine' mode keep only owned items; in 'all' mode show everything the
        // caller is authorized to see.
        const visible =
          scope === 'all' ? items : items.filter((item) => item.owner?.startsWith(userId));
        setUseCases(
          [...visible].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')),
        );
        setLoading(false);
      },
      error: () => setLoading(false),
    });
    return () => subscription.unsubscribe();
  }, [userId, scope]);

  return (
    <section>
      <div className="section-header">
        <h2>{scope === 'all' ? 'All use cases' : 'My use cases'}</h2>
        {scope === 'mine' && <button onClick={onCreate}>+ New use case</button>}
      </div>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : useCases.length === 0 ? (
        <div className="card empty-state">
          {scope === 'all' ? (
            <p>No use cases have been created yet.</p>
          ) : (
            <>
              <p>No use cases yet. Create your first GenAI use-case proposal.</p>
              <button onClick={onCreate}>+ New use case</button>
            </>
          )}
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
