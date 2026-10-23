import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, FolderOpen, Plus, Search, SearchX, Target, Trash2 } from 'lucide-react';
import Header from '../components/Header.jsx';
import PlanStatusBadge from '../components/PlanStatusBadge.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import LoadingState from '../components/LoadingState.jsx';
import { useApp } from '../state/AppState.jsx';
import { displayStatus, formatDate, planPath, planTitle, progressOf } from '../utils/plan.js';

const FILTERS = [
  { key: 'all', label: 'All statuses' },
  { key: 'pending', label: 'Pending approval' },
  { key: 'approved', label: 'Approved' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'rejected', label: 'Rejected' },
];

export default function Plans() {
  const { plans, load, backendConfigured, refreshPlans, actions } = useApp();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('newest');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = plans.filter((p) => {
      const matches = !q || planTitle(p).toLowerCase().includes(q) || p.goal.toLowerCase().includes(q);
      return matches && (status === 'all' || displayStatus(p).key === status);
    });
    return list.sort((a, b) =>
      sort === 'progress'
        ? progressOf(b) - progressOf(a)
        : new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
    );
  }, [plans, query, status, sort]);

  const isLoading = backendConfigured && (load.status === 'loading' || load.status === 'idle') && plans.length === 0;
  const filtering = query.trim() !== '' || status !== 'all';

  async function removePlan(plan) {
    if (!window.confirm(`Delete “${planTitle(plan)}”? This cannot be undone.`)) return;
    const result = await actions.deletePlan(plan.id);
    if (!result.ok) window.alert(`Couldn’t delete the plan. ${result.error}`);
  }

  return (
    <div className="page">
      <Header
        title="My Plans"
        subtitle="View and manage all your plans. Open a plan to see details, track progress or review a reschedule."
      />

      {load.status === 'error' && (
        <ErrorMessage
          title="Couldn’t load your plans"
          actions={
            <button type="button" className="btn btn-secondary btn-sm" onClick={refreshPlans}>
              Try again
            </button>
          }
        >
          {load.error}
        </ErrorMessage>
      )}

      {isLoading ? (
        <LoadingState label="Loading your plans…" />
      ) : plans.length === 0 ? (
        <EmptyState
          icon={<FolderOpen size={24} />}
          title="No plans yet"
          actions={
            <Link to="/assistant?mode=create" className="btn btn-primary">
              <Plus size={16} aria-hidden="true" /> Create with AI
            </Link>
          }
        >
          {backendConfigured
            ? 'Create your first plan and it will appear here.'
            : 'Plans are saved by the TaskPilot backend, which isn’t connected yet. Once it is, your plans will be listed here.'}
        </EmptyState>
      ) : (
        <>
          <div className="toolbar" role="search" aria-label="Filter plans">
            <div className="input-wrap grow">
              <Search size={17} aria-hidden="true" />
              <label htmlFor="plan-search" className="sr-only">
                Search plans by goal
              </label>
              <input
                id="plan-search"
                className="input"
                type="search"
                placeholder="Search by goal…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="toolbar-select">
              <label htmlFor="plan-status" className="sr-only">
                Filter by status
              </label>
              <select id="plan-status" className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                {FILTERS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="toolbar-select">
              <label htmlFor="plan-sort" className="sr-only">
                Sort plans
              </label>
              <select id="plan-sort" className="select" value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="newest">Newest first</option>
                <option value="progress">Highest progress</option>
              </select>
            </div>
          </div>

          <p className="field-hint" aria-live="polite">
            Showing {visible.length} of {plans.length} {plans.length === 1 ? 'plan' : 'plans'}
          </p>

          {visible.length === 0 ? (
            <EmptyState
              icon={<SearchX size={24} />}
              title="No matching plans"
              actions={
                filtering && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setQuery('');
                      setStatus('all');
                    }}
                  >
                    Clear filters
                  </button>
                )
              }
            >
              Try a different search or status filter.
            </EmptyState>
          ) : (
            <div className="card table-card">
              <table className="plans-table">
                <thead>
                  <tr>
                    <th scope="col">Goal</th>
                    <th scope="col">Status</th>
                    <th scope="col">Progress</th>
                    <th scope="col">Created</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((plan) => (
                    <tr key={plan.id}>
                      <td data-label="Goal">
                        <span className="goal-cell">
                          <span className="plan-icon" aria-hidden="true">
                            <Target size={16} />
                          </span>
                          <span>{planTitle(plan)}</span>
                        </span>
                      </td>
                      <td data-label="Status">
                        <PlanStatusBadge plan={plan} />
                      </td>
                      <td data-label="Progress">
                        {plan.status === 'approved' ? (
                          <ProgressBar value={progressOf(plan)} label={`${planTitle(plan)} progress`} />
                        ) : (
                          <span className="field-hint">Not tracking</span>
                        )}
                      </td>
                      <td data-label="Created">{formatDate(plan.createdAt) ?? '—'}</td>
                      <td className="action-cell">
                        <Link to={planPath(plan)} className="icon-btn" aria-label={`${plan.status === 'pending' ? 'Review' : 'View'} plan: ${planTitle(plan)}`} title={plan.status === 'pending' ? 'Review plan' : 'View plan'}>
                          <Eye size={16} aria-hidden="true" />
                        </Link>
                        <button type="button" className="icon-btn btn-danger" onClick={() => removePlan(plan)} aria-label={`Delete plan: ${planTitle(plan)}`} title="Delete plan">
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
