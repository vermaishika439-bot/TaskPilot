import { displayStatus } from '../utils/plan.js';

export default function PlanStatusBadge({ plan, statusKey, label }) {
  const status = plan ? displayStatus(plan) : { key: statusKey, label };
  return <span className={`badge badge-${status.key}`}>{status.label}</span>;
}

export function PriorityBadge({ priority }) {
  const key = ['high', 'medium', 'low'].includes(priority) ? priority : 'neutral';
  const label = key === 'neutral' ? 'No priority' : `${key[0].toUpperCase()}${key.slice(1)}`;
  return <span className={`chip chip-${key}`}>{label}</span>;
}
