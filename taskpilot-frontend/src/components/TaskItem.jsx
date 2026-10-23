import { CalendarClock, Check, LoaderCircle, Save, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PriorityBadge } from './PlanStatusBadge.jsx';
import { formatDuration } from '../utils/plan.js';

/**
 * A task row. When `onToggle` is omitted (or `disabled`), it renders as read-only.
 * The checkbox reflects server-confirmed data only — it never flips optimistically.
 */
export default function TaskItem({ task, onToggle, onSchedule, disabled = false, busy = false, disabledReason, showState = false }) {
  const interactive = Boolean(onToggle);
  const [editing, setEditing] = useState(false);
  const [schedule, setSchedule] = useState({ scheduledDate: task.scheduledDate || '', scheduledTime: task.scheduledTime || '', scheduledEndTime: task.scheduledEndTime || '' });
  const inputId = `task-${task.id}`;

  useEffect(() => {
    setSchedule({ scheduledDate: task.scheduledDate || '', scheduledTime: task.scheduledTime || '', scheduledEndTime: task.scheduledEndTime || '' });
  }, [task.scheduledDate, task.scheduledTime, task.scheduledEndTime]);

  async function saveSchedule(event) {
    event.preventDefault();
    const result = await onSchedule(task, schedule);
    if (result?.ok) setEditing(false);
  }

  return (
    <li className={`task${task.completed ? ' done' : ''}`}>
      {interactive ? (
        <span className="task-check">
          <input
            id={inputId}
            type="checkbox"
            checked={Boolean(task.completed)}
            disabled={disabled || busy}
            aria-describedby={disabled && disabledReason ? `${inputId}-why` : undefined}
            onChange={(e) => onToggle(task, e.target.checked)}
          />
          <span className="task-box" aria-hidden="true">
            {busy ? <LoaderCircle size={13} className="spin" /> : <Check size={14} strokeWidth={3} />}
          </span>
        </span>
      ) : null}

      {interactive ? (
        <label className="task-title" htmlFor={inputId}>
          {task.title}
        </label>
      ) : (
        <span className="task-title">{task.title}</span>
      )}

      {disabled && disabledReason && (
        <span id={`${inputId}-why`} className="sr-only">
          {disabledReason}
        </span>
      )}

      <PriorityBadge priority={task.priority} />
      <span className="task-dur">{formatDuration(task.durationMinutes)}</span>
      {showState && (
        <span className="task-state">
          <span className={`badge ${task.completed ? 'badge-active' : 'badge-pending'}`}>
            {task.completed ? 'Completed' : 'Pending'}
          </span>
        </span>
      )}
      {onSchedule && !disabled && !editing && (
        <button type="button" className="task-schedule-button" onClick={() => setEditing(true)} aria-label={`Edit schedule for ${task.title}`} title="Edit schedule">
          <CalendarClock size={15} aria-hidden="true" />
        </button>
      )}
      {(task.scheduledDate || task.scheduledTime) && !editing && (
        <span className="task-schedule-label">
          {task.scheduledDate ? new Date(`${task.scheduledDate}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}
          {task.scheduledTime ? ` · ${task.scheduledTime}${task.scheduledEndTime ? `–${task.scheduledEndTime}` : ''}` : ''}
        </span>
      )}
      {editing && (
        <form className="task-schedule-editor" onSubmit={saveSchedule}>
          <label><span className="sr-only">Date</span><input type="date" value={schedule.scheduledDate} onChange={(event) => setSchedule((current) => ({ ...current, scheduledDate: event.target.value }))} required /></label>
          <label><span className="sr-only">Start time</span><input type="time" value={schedule.scheduledTime} onChange={(event) => setSchedule((current) => ({ ...current, scheduledTime: event.target.value }))} /></label>
          <label><span className="sr-only">End time</span><input type="time" value={schedule.scheduledEndTime} onChange={(event) => setSchedule((current) => ({ ...current, scheduledEndTime: event.target.value }))} /></label>
          <button type="submit" className="task-schedule-icon" aria-label="Save schedule"><Save size={14} /></button>
          <button type="button" className="task-schedule-icon" onClick={() => setEditing(false)} aria-label="Cancel schedule edit"><X size={14} /></button>
        </form>
      )}
    </li>
  );
}
