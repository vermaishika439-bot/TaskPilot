import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, Clock, Target } from 'lucide-react';
import PlanStatusBadge from './PlanStatusBadge.jsx';
import ProgressBar from './ProgressBar.jsx';
import { formatDate, plural, planPath, planTitle, progressOf, taskCounts } from '../utils/plan.js';

/** Large card used for the featured / active plan. */
export default function PlanCard({ plan, heading = 'Your active plan' }) {
  const { done, total } = taskCounts(plan);
  const created = formatDate(plan.createdAt);
  const isPending = plan.status === 'pending';

  return (
    <article className="card" aria-label={heading}>
      <h2 className="card-title">{heading}</h2>
      <h3 className="plan-card-title">{planTitle(plan)}</h3>
      <div className="plan-meta">
        <span>
          <CalendarDays size={14} aria-hidden="true" />
          {plural(plan.availableDays, 'day')}
        </span>
        <span>
          <Clock size={14} aria-hidden="true" />
          {plan.hasVariedAvailability ? `${plan.totalAvailableHours} hrs total` : `${plan.hoursPerDay} hrs/day`}
        </span>
        {created && (
          <span>
            <Target size={14} aria-hidden="true" />
            Created {created}
          </span>
        )}
        <PlanStatusBadge plan={plan} />
      </div>
      <div style={{ marginTop: 18 }}>
        <ProgressBar value={progressOf(plan)} label={`${planTitle(plan)} progress`} />
        <p className="field-hint" style={{ marginTop: 6 }}>
          {done} of {total} tasks completed
        </p>
      </div>
      <div className="plan-card-foot">
        <Link to={planPath(plan)} className="btn btn-primary btn-sm">
          {isPending ? 'Review Plan' : 'View Plan'} <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
