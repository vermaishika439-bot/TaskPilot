import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarDays, Clock, Target, ThumbsDown, ThumbsUp } from 'lucide-react';
import Header from '../components/Header.jsx';
import PlanLookup from '../components/PlanLookup.jsx';
import PlanStatusBadge from '../components/PlanStatusBadge.jsx';
import DayCard from '../components/DayCard.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useApp } from '../state/AppState.jsx';
import { formatDuration, plural, planTitle, allTasks } from '../utils/plan.js';

export default function ReviewPlan() {
  const { planId } = useParams();
  return <PlanLookup planId={planId}>{(plan) => <ReviewContent plan={plan} />}</PlanLookup>;
}

function ReviewContent({ plan }) {
  const { actions, toast } = useApp();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState(null); // 'approve' | 'reject' | null
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const isPending = plan.status === 'pending';
  const totalMinutes = allTasks(plan).reduce((s, t) => s + (Number(t.durationMinutes) || 0), 0);

  function close() {
    if (busy) return;
    setDialog(null);
    setError(null);
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    const result = dialog === 'approve' ? await actions.approvePlan(plan.id) : await actions.rejectPlan(plan.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // Reached only when the API confirmed the action.
    setDialog(null);
    if (dialog === 'approve') {
      toast('Plan approved. You can start tracking tasks.', 'success');
      navigate(`/plans/${plan.id}`);
    } else {
      toast('Plan rejected.', 'success');
    }
  }

  return (
    <div className="page">
      <Header
        title="Review Your Plan"
        back={{ to: '/plans', label: 'My Plans' }}
        subtitle="Here’s the AI-generated plan for your goal. Take a look and approve it to start tracking."
      />

      <section className="card summary-card" aria-label="Plan summary">
        <span className="plan-icon big" aria-hidden="true">
          <Target size={22} />
        </span>
        <div className="summary-main">
          <h2 className="summary-title">{planTitle(plan)}</h2>
          <div className="plan-meta">
            <span>
              <CalendarDays size={14} aria-hidden="true" /> {plural(plan.availableDays, 'day')}
            </span>
            <span>
              <Clock size={14} aria-hidden="true" /> {plan.hoursPerDay} hrs/day
            </span>
            {totalMinutes > 0 && <span>{formatDuration(totalMinutes)} total</span>}
          </div>
          {plan.summary && <p className="summary-text">{plan.summary}</p>}
        </div>
        <PlanStatusBadge plan={plan} />
      </section>

      {!isPending && (
        <ErrorMessage
          tone={plan.status === 'rejected' ? 'warn' : 'success'}
          title={plan.status === 'rejected' ? 'This plan was rejected' : 'This plan has been approved'}
          actions={
            plan.status !== 'rejected' ? (
              <Link to={`/plans/${plan.id}`} className="btn btn-secondary btn-sm">
                Open plan
              </Link>
            ) : (
              <Link to="/assistant?mode=create" className="btn btn-secondary btn-sm">
                Create a new plan
              </Link>
            )
          }
        >
          {plan.status === 'rejected'
            ? 'Tasks can’t be tracked for rejected plans.'
            : 'It’s ready for task tracking.'}
        </ErrorMessage>
      )}

      {plan.days?.length ? (
        <div className="day-grid">
          {plan.days.map((day) => (
            <DayCard key={day.id ?? day.label} day={day} />
          ))}
        </div>
      ) : (
        <EmptyState title="This plan has no tasks yet" />
      )}

      {isPending && (
        <div className="action-bar" role="group" aria-label="Plan decision">
          <p className="field-hint">Nothing is tracked until you approve this plan.</p>
          <div className="action-buttons">
            <button type="button" className="btn btn-danger" onClick={() => setDialog('reject')}>
              <ThumbsDown size={16} aria-hidden="true" /> Reject Plan
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setDialog('approve')}>
              <ThumbsUp size={16} aria-hidden="true" /> Approve Plan
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={dialog === 'approve'}
        title="Approve this plan?"
        confirmLabel="Approve Plan"
        busy={busy}
        error={dialog === 'approve' ? error : null}
        onConfirm={confirm}
        onCancel={close}
      >
        Approving unlocks task tracking for “{planTitle(plan)}”. The plan only changes once the server confirms.
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'reject'}
        title="Reject this plan?"
        confirmLabel="Reject Plan"
        tone="danger"
        busy={busy}
        error={dialog === 'reject' ? error : null}
        onConfirm={confirm}
        onCancel={close}
      >
        Rejected plans can’t be tracked. You can always create a new plan for the same goal.
      </ConfirmDialog>
    </div>
  );
}
