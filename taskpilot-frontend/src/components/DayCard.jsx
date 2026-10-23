import { Clock } from 'lucide-react';
import TaskItem from './TaskItem.jsx';
import { dayMinutes, formatDuration } from '../utils/plan.js';

/** One day of a plan with its tasks and total workload. Pass `onToggle` to make tasks checkable. */
export default function DayCard({ day, onToggle, onSchedule, disabled, disabledReason, busyTaskId, showState = false }) {
  const minutes = dayMinutes(day);
  return (
    <section className="day-card" aria-label={day.label}>
      <div className="day-head">
        <h3 className="day-title">
          {day.label}
          {day.title ? ` – ${day.title}` : ''}
        </h3>
        {minutes > 0 && (
          <span className="day-hours" title="Total workload for this day">
            <Clock size={14} aria-hidden="true" />
            {formatDuration(minutes)}
          </span>
        )}
      </div>
      {day.tasks?.length ? (
        <ul>
          {day.tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onToggle={onToggle}
              onSchedule={onSchedule}
              disabled={disabled}
              disabledReason={disabledReason}
              busy={busyTaskId === task.id}
              showState={showState}
            />
          ))}
        </ul>
      ) : (
        <p className="field-hint">No tasks scheduled.</p>
      )}
    </section>
  );
}
