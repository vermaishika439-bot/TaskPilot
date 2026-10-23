import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, CalendarClock, CalendarDays, CircleCheck, Clock, ShieldCheck } from 'lucide-react';
import Header from '../components/Header.jsx';
import PlanLookup from '../components/PlanLookup.jsx';
import DayCard from '../components/DayCard.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useApp } from '../state/AppState.jsx';
import { formatDate, planTitle } from '../utils/plan.js';

export default function RescheduleReview() {
  const { planId } = useParams();
  return <PlanLookup planId={planId}>{(plan) => <RescheduleContent plan={plan} />}</PlanLookup>;
}

function RescheduleContent({ plan }) {
  const { actions, toast } = useApp();
  const [dialog, setDialog] = useState(null); // 'accept' | 'reject' | null
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [outcome, setOutcome] = useState(null); // 'accepted' | 'rejected'
  const [view, setView] = useState('proposed'); // 'proposed' | 'current'

  const proposal = plan.proposal;

  function close() {
    if (busy) return;
    setDialog(null);
    setError(null);
  }

  async function confirm() {
    const accepting = dialog === 'accept';
    setBusy(true);
    setError(null);
    const result = accepting
      ? await actions.acceptProposal(plan.id, proposal.id)
      : await actions.rejectProposal(plan.id, proposal.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // Reached only when the API confirmed the decision.
    setDialog(null);
    setOutcome(accepting ? 'accepted' : 'rejected');
    toast(accepting ? 'Revised schedule applied.' : 'Proposal rejected. Your schedule is unchanged.', 'success');
  }

  if (outcome) {
    return (
      <div className="page">
        <Header title="Rescheduling Proposal" back={{ to: `/plans/${plan.id}`, label: planTitle(plan) }} />
        <ErrorMessage
          tone="success"
          title={outcome === 'accepted' ? 'Revised schedule applied' : 'Proposal rejected'}
          actions={
            <Link to={`/plans/${plan.id}`} className="btn btn-primary btn-sm">
              View plan <ArrowRight size={15} aria-hidden="true" />
            </Link>
          }
        >
          {outcome === 'accepted'
            ? 'The server confirmed the change. Your plan now shows the new schedule.'
            : 'Your existing schedule was preserved.'}
        </ErrorMessage>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="page">
        <Header title="Rescheduling Proposal" back={{ to: `/plans/${plan.id}`, label: planTitle(plan) }} />
        <EmptyState
          icon={<CalendarClock size={24} />}
          title="No proposal to review"
          actions={
            <Link to={`/plans/${plan.id}`} className="btn btn-secondary">
              Back to plan
            </Link>
          }
        >
          There’s no pending revised schedule for this plan. If you fall behind, request one from the plan page — it will
          appear here as a proposal for you to accept or reject.
        </EmptyState>
      </div>
    );
  }

  const generated = formatDate(proposal.generatedAt);
  const shownDays = view === 'proposed' ? proposal.days : plan.days;

  return (
    <div className="page">
      <Header
        title="Rescheduling Proposal"
        back={{ to: `/plans/${plan.id}`, label: planTitle(plan) }}
        subtitle="You’ve fallen behind. Here’s a suggested revised schedule based on your progress."
      />

      <section className="card proposal-card" aria-label="Proposal">
        <div className="proposal-head">
          <span className="badge badge-notapplied">Not applied yet</span>
          <span className="field-hint">
            Proposal for {planTitle(plan)}
            {generated ? ` · Generated ${generated}` : ''}
          </span>
        </div>
        <p className="proposal-safe">
          <ShieldCheck size={16} aria-hidden="true" /> Your current schedule stays exactly as it is until you accept.
        </p>

        <div className="proposal-grid">
          <div className="proposal-box">
            <h2 className="box-title">What’s changed?</h2>
            <ul className="checklist">
              {(proposal.changes ?? []).map((c) => (
                <li key={c}>
                  <CircleCheck size={16} aria-hidden="true" /> {c}
                </li>
              ))}
              {!proposal.changes?.length && <li className="field-hint">No change summary was provided.</li>}
            </ul>
          </div>

          <div className="proposal-compare">
            <div className="compare-col">
              <h2 className="box-title">Original plan</h2>
              <p className="compare-line">
                <CalendarDays size={15} aria-hidden="true" /> {proposal.original.remainingDays} days left
              </p>
              <p className="compare-line">
                <Clock size={15} aria-hidden="true" /> {proposal.original.hoursPerDay} hrs/day
              </p>
            </div>
            <ArrowRight size={18} className="compare-arrow" aria-hidden="true" />
            <div className="compare-col revised">
              <h2 className="box-title">Revised plan</h2>
              <p className="compare-line">
                <CalendarDays size={15} aria-hidden="true" /> {proposal.revised.remainingDays} days left
              </p>
              <p className="compare-line">
                <Clock size={15} aria-hidden="true" /> {proposal.revised.totalHours || proposal.revised.hoursPerDay} hrs available
              </p>
            </div>
          </div>

          <div className="proposal-box">
            <h2 className="box-title">Summary</h2>
            <dl className="kv">
              <div className="kv-row">
                <dt>Tasks moved</dt>
                <dd>{proposal.tasksMoved}</dd>
              </div>
              <div className="kv-row">
                <dt>New tasks</dt>
                <dd>{proposal.newTasks}</dd>
              </div>
              <div className="kv-row">
                <dt>Total tasks</dt>
                <dd>{proposal.totalTasks}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <section aria-label="Schedule comparison" className="stack">
        <div className="tabs" role="group" aria-label="Which schedule to view">
          {[
            ['proposed', 'Proposed schedule'],
            ['current', 'Current schedule'],
          ].map(([key, label]) => (
            <button key={key} type="button" className="tab" aria-selected={view === key} aria-pressed={view === key} onClick={() => setView(key)}>
              {label}
            </button>
          ))}
        </div>
        <div className="day-grid">
          {shownDays.map((day) => (
            <DayCard key={day.id ?? day.label} day={day} />
          ))}
        </div>
      </section>

      <div className="action-bar" role="group" aria-label="Proposal decision">
        <p className="field-hint">Rejecting keeps your current schedule untouched.</p>
        <div className="action-buttons">
          <button type="button" className="btn btn-secondary" onClick={() => setDialog('reject')}>
            Reject Proposal
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setDialog('accept')}>
            Accept Proposal
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={dialog === 'accept'}
        title="Apply the revised schedule?"
        confirmLabel="Accept Proposal"
        busy={busy}
        error={dialog === 'accept' ? error : null}
        onConfirm={confirm}
        onCancel={close}
      >
        This replaces your remaining schedule with the proposed one. Completed tasks stay as they are.
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'reject'}
        title="Reject this proposal?"
        confirmLabel="Reject Proposal"
        tone="danger"
        busy={busy}
        error={dialog === 'reject' ? error : null}
        onConfirm={confirm}
        onCancel={close}
      >
        Your existing schedule will be kept exactly as it is.
      </ConfirmDialog>
    </div>
  );
}
