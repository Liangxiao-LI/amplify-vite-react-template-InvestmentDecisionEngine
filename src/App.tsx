import { useEffect, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { Dashboard } from './features/dashboard/Dashboard';
import { UseCaseList } from './features/use-cases/UseCaseList';
import { UseCaseForm } from './features/use-cases/UseCaseForm';
import { UseCaseDetail } from './features/use-cases/UseCaseDetail';
import { ReviewQueue } from './features/reviews/ReviewQueue';

type Page = 'dashboard' | 'mine' | 'review' | 'new';

/**
 * GenAI Use-Case Decision Platform — authenticated shell (§11).
 * Requesters submit and track proposals; Reviewers work the review queue.
 */
function App() {
  const { user, signOut } = useAuthenticator((context) => [context.user]);
  const [groups, setGroups] = useState<string[]>([]);
  const [page, setPage] = useState<Page>('dashboard');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const userId = user?.userId ?? '';

  useEffect(() => {
    let cancelled = false;
    fetchAuthSession()
      .then((session) => {
        const payload = session.tokens?.accessToken.payload;
        const claim = payload?.['cognito:groups'];
        if (!cancelled && Array.isArray(claim)) {
          setGroups(claim.filter((g): g is string => typeof g === 'string'));
        }
      })
      .catch(() => {
        /* groups stay empty; UI falls back to requester-only view */
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const isReviewer = groups.includes('REVIEWER') || groups.includes('ADMIN');

  function openUseCase(id: string) {
    setSelectedId(id);
  }

  function navigate(next: Page) {
    setSelectedId(null);
    setPage(next);
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>GenAI Use-Case Decision Platform</h1>
          <span className="muted">
            AI assessments are advisory — final decisions are made by human reviewers.
          </span>
        </div>
        <div className="header-user">
          <span className="muted">{user?.signInDetails?.loginId ?? ''}</span>
          {isReviewer && <span className="badge badge-info">Reviewer</span>}
          <button className="secondary" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <nav className="app-nav">
        <button
          className={page === 'dashboard' && !selectedId ? 'nav-active' : 'nav'}
          onClick={() => navigate('dashboard')}
        >
          Dashboard
        </button>
        <button
          className={page === 'mine' && !selectedId ? 'nav-active' : 'nav'}
          onClick={() => navigate('mine')}
        >
          My use cases
        </button>
        {isReviewer && (
          <button
            className={page === 'review' && !selectedId ? 'nav-active' : 'nav'}
            onClick={() => navigate('review')}
          >
            Review queue
          </button>
        )}
      </nav>

      <main className="app-main">
        {selectedId ? (
          <UseCaseDetail
            useCaseId={selectedId}
            userId={userId}
            isReviewer={isReviewer}
            onBack={() => setSelectedId(null)}
          />
        ) : page === 'dashboard' ? (
          <Dashboard onOpen={openUseCase} />
        ) : page === 'mine' ? (
          <UseCaseList
            userId={userId}
            onOpen={openUseCase}
            onCreate={() => setPage('new')}
          />
        ) : page === 'review' && isReviewer ? (
          <ReviewQueue onOpen={openUseCase} />
        ) : page === 'new' ? (
          <UseCaseForm
            userId={userId}
            onSaved={(id) => {
              setPage('mine');
              setSelectedId(id);
            }}
            onCancel={() => setPage('mine')}
          />
        ) : (
          <Dashboard onOpen={openUseCase} />
        )}
      </main>
    </div>
  );
}

export default App;
