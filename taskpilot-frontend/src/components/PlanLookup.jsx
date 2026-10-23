import { Link } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import EmptyState from './EmptyState.jsx';
import LoadingState from './LoadingState.jsx';
import { useApp, usePlan } from '../state/AppState.jsx';

/**
 * Resolves a plan by id from loaded data and renders loading / not-found states.
 * Usage: <PlanLookup planId={id}>{(plan) => <Page plan={plan} />}</PlanLookup>
 */
export default function PlanLookup({ planId, children }) {
  const plan = usePlan(planId);
  const { load, isPreview, backendConfigured } = useApp();

  if (plan) return children(plan);

  if (!isPreview && backendConfigured && (load.status === 'loading' || load.status === 'idle')) {
    return <LoadingState label="Loading plan…" />;
  }

  return (
    <div className="page">
      <EmptyState
        icon={<SearchX size={24} />}
        title="Plan not found"
        actions={
          <>
            <Link to="/plans" className="btn btn-secondary">
              Go to My Plans
            </Link>
            <Link to="/assistant?mode=create" className="btn btn-primary">
              Create with AI
            </Link>
          </>
        }
      >
        This plan isn’t in the data currently loaded. It may not exist yet, or the backend hasn’t returned it.
      </EmptyState>
    </div>
  );
}
