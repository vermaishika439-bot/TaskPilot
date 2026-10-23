import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { CalendarClock, CalendarDays, Clock, Target } from 'lucide-react';
import Header from '../components/Header.jsx';
import PlanLookup from '../components/PlanLookup.jsx';
import PlanStatusBadge from '../components/PlanStatusBadge.jsx';
import ProgressBar, { ProgressRing } from '../components/ProgressBar.jsx';
import DayCard from '../components/DayCard.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { useApp } from '../state/AppState.jsx';
import { dayMinutes, formatDate, formatDuration, plural, planTitle, progressOf, taskCounts } from '../utils/plan.js';

function parseNaturalAvailability(line) {
  const match = line.trim().match(/^(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s+to\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  const [, day, monthText, yearText, startHour, startMinute = '00', startMeridiem, endHour, endMinute = '00', endMeridiem] = match;
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const month = months.indexOf(monthText.slice(0, 3).toLowerCase());
  if (month < 0) return null;
  const year = Number(yearText || new Date().getFullYear());
  const clock = (hour, minute, meridiem) => {
    let h = Number(hour);
    if (meridiem) {
      h %= 12;
      if (meridiem.toLowerCase() === 'pm') h += 12;
    }
    return h * 60 + Number(minute);
  };
  const start = clock(startHour, startMinute, startMeridiem || endMeridiem);
  const end = clock(endHour, endMinute, endMeridiem || startMeridiem);
  if (start < 0 || end <= start || end - start > 1440) return null;
  const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const formatTime = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  return { date, start_time: formatTime(start), end_time: formatTime(end), hours: (end - start) / 60 };
}

const TABS = ['Tasks', 'Progress', 'Details'];

export default function PlanDetails() {
  const { planId } = useParams();
  return <PlanLookup planId={planId}>{(plan) => <DetailsContent plan={plan} />}</PlanLookup>;
}

function DetailsContent({ plan }) {
  const { actions, toast } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState('Tasks');
  const [busyTaskId, setBusyTaskId] = useState(null);
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState(null);
  const [showAvailability, setShowAvailability] = useState(false);
  const [availabilityText, setAvailabilityText] = useState('');

  // Pending plans are reviewed, not tracked.
  if (plan.status === 'pending') return <Navigate to={`/plans/${plan.id}/review`} replace />;

  const canTrack = plan.status === 'approved';
  const { done, pending, total } = taskCounts(plan);
  const pct = progressOf(plan);
  const created = formatDate(plan.createdAt);
  const disabledReason = plan.status === 'rejected' ? 'Rejected plans can’t be tracked.' : 'Approve the plan to track tasks.';

  async function toggle(task, completed) {
    setBusyTaskId(task.id);
    const result = await actions.setTaskStatus(plan.id, task.id, completed);
    setBusyTaskId(null);
    if (!result.ok) toast(`Couldn’t save that change. ${result.error}`, 'error');
  }

  async function requestProposal() {
    const availability = availabilityText.split('\n').map(parseNaturalAvailability).filter(Boolean);
    if (!availability.length) {
      setRequestError('Use a natural line such as “26 Oct - 5pm to 9pm”.');
      return;
    }
    setRequesting(true);
    setRequestError(null);
    const result = await actions.requestReschedule(plan.id, availability);
    setRequesting(false);
    if (!result.ok) {
      setRequestError(result.error);
      return;
    }
    if (result.value?.proposal) navigate(`/plans/${plan.id}/reschedule`);
    else setRequestError('The server responded, but no proposal was returned.');
  }

  async function updateSchedule(task, schedule) {
    const result = await actions.setTaskSchedule(plan.id, task.id, schedule);
    if (!result.ok) toast(`Couldn’t save the schedule. ${result.error}`, 'error');
    return result;
  }

  return (
    <div className="page">
      <Header title="Plan Details" back={{ to: '/plans', label: 'My Plans' }} />

      <div className="details-top">
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
                <Clock size={14} aria-hidden="true" /> {plan.hasVariedAvailability ? `${plan.totalAvailableHours} hrs total` : `${plan.hoursPerDay} hrs/day`}
              </span>
              <PlanStatusBadge plan={plan} />
            </div>
          </div>
        </section>

        <section className="card progress-card" aria-label="Overall progress">
          <h2 className="stat-label">Overall progress</h2>
          <div className="progress-card-body">
            <ProgressRing value={pct} size={64} stroke={6} label="Overall progress" />
            <p>
              <strong>
                {done} of {total}
              </strong>{' '}
              tasks completed
            </p>
          </div>
        </section>
      </div>

      {plan.status === 'rejected' && (
        <ErrorMessage tone="warn" title="This plan was rejected">
          Task tracking is disabled for rejected plans.
        </ErrorMessage>
      )}

      {plan.proposal && (
        <ErrorMessage
          tone="info"
          title="A revised schedule is waiting for your decision"
          actions={
            <Link to={`/plans/${plan.id}/reschedule`} className="btn btn-secondary btn-sm">
              Review proposal
            </Link>
          }
        >
          It’s not applied yet — your current schedule stays as is until you accept.
        </ErrorMessage>
      )}

      <div className="details-grid">
        <div className="details-main">
          <div className="tabs" role="tablist" aria-label="Plan sections">
            {TABS.map((name) => (
              <button
                key={name}
                id={`tab-${name}`}
                type="button"
                role="tab"
                className="tab"
                aria-selected={tab === name}
                aria-controls={`panel-${name}`}
                tabIndex={tab === name ? 0 : -1}
                onClick={() => setTab(name)}
                onKeyDown={(e) => {
                  const i = TABS.indexOf(name);
                  const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i - 1 + TABS.length) % TABS.length : null;
                  if (next !== null) {
                    setTab(TABS[next]);
                    document.getElementById(`tab-${TABS[next]}`)?.focus();
                  }
                }}
              >
                {name}
              </button>
            ))}
          </div>

          <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="tab-panel">
            {tab === 'Tasks' && (
              <>
                {!canTrack && <p className="field-hint">{disabledReason}</p>}
                <div className="stack">
                  {plan.days.map((day) => (
                    <DayCard
                      key={day.id ?? day.label}
                      day={day}
                      showState
                      onToggle={toggle}
                      onSchedule={updateSchedule}
                      disabled={!canTrack}
                      disabledReason={disabledReason}
                      busyTaskId={busyTaskId}
                    />
                  ))}
                </div>
              </>
            )}

            {tab === 'Progress' && (
              <div className="card">
                <div className="stack">
                  {plan.days.map((day) => {
                    const d = day.tasks.filter((t) => t.completed).length;
                    return (
                      <div key={day.id ?? day.label}>
                        <div className="progress-row-head">
                          <span>
                            {day.label}
                            {day.title ? ` – ${day.title}` : ''}
                          </span>
                          <span className="field-hint">
                            {d}/{day.tasks.length} tasks · {formatDuration(dayMinutes(day))}
                          </span>
                        </div>
                        <ProgressBar value={day.tasks.length ? (d / day.tasks.length) * 100 : 0} label={`${day.label} progress`} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {tab === 'Details' && (
              <div className="card">
                <dl className="kv">
                  <div className="kv-row">
                    <dt>Goal</dt>
                    <dd>{plan.goal}</dd>
                  </div>
                  {plan.summary && (
                    <div className="kv-row">
                      <dt>Summary</dt>
                      <dd style={{ fontWeight: 500 }}>{plan.summary}</dd>
                    </div>
                  )}
                  <div className="kv-row">
                    <dt>Available days</dt>
                    <dd>{plan.availableDays}</dd>
                  </div>
                  <div className="kv-row">
                    <dt>Hours per day</dt>
                    <dd>{plan.hasVariedAvailability ? `${plan.totalAvailableHours} total across ${plan.availableDays} days` : plan.hoursPerDay}</dd>
                  </div>
                  <div className="kv-row">
                    <dt>Status</dt>
                    <dd>
                      <PlanStatusBadge plan={plan} />
                    </dd>
                  </div>
                  {created && (
                    <div className="kv-row">
                      <dt>Created</dt>
                      <dd>{created}</dd>
                    </div>
                  )}
                </dl>
              </div>
            )}
          </div>
        </div>

        <aside className="details-side">
          <section className="card" aria-label="Task summary">
            <h2 className="card-title" style={{ marginBottom: 8 }}>
              Task summary
            </h2>
            <dl className="kv">
              <div className="kv-row">
                <dt>Completed</dt>
                <dd>{done}</dd>
              </div>
              <div className="kv-row">
                <dt>Pending</dt>
                <dd>{pending}</dd>
              </div>
              <div className="kv-row">
                <dt>Total</dt>
                <dd>{total}</dd>
              </div>
            </dl>
          </section>

          {canTrack && pending > 0 && !plan.proposal && (
            <section className="card" aria-label="Falling behind">
              <h2 className="card-title">Falling behind?</h2>
              <p className="field-hint" style={{ margin: '6px 0 14px' }}>
                Ask for a revised schedule. You’ll see it as a proposal first — nothing changes until you accept.
              </p>
              {requestError && (
                <div style={{ marginBottom: 12 }}>
                  <ErrorMessage title="Couldn’t request a revised schedule">{requestError}</ErrorMessage>
                </div>
              )}
              {showAvailability && (
                <div className="reschedule-availability-form" style={{ marginBottom: 12 }}>
                  <label className="field-label" htmlFor="new-availability">New available study times</label>
                  <textarea
                    id="new-availability"
                    className="textarea"
                    rows={3}
                    value={availabilityText}
                    onChange={(event) => setAvailabilityText(event.target.value)}
                    placeholder={'One line per date:\n26 Oct - 5pm to 9pm\n28 Oct - 1pm to 3pm'}
                  />
                  <p className="field-hint">Write naturally, one date per line. Completed tasks will stay unchanged.</p>
                </div>
              )}
              <button type="button" className="btn btn-secondary btn-block" onClick={() => {
                if (!showAvailability) setShowAvailability(true);
                else requestProposal();
              }} disabled={requesting}>
                <CalendarClock size={16} aria-hidden="true" />
                {requesting ? 'Requesting…' : showAvailability ? 'Create revised schedule' : 'Request revised schedule'}
              </button>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
