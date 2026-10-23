import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Bell, CalendarDays, Clock3, ExternalLink, RotateCcw, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import EmptyState from './EmptyState.jsx';
import { useApp } from '../state/AppState.jsx';

const DAY = 86400000;
const startOfDay = (value) => { const d = value instanceof Date ? new Date(value) : new Date(value || Date.now()); d.setHours(0, 0, 0, 0); return d; };
const addDays = (value, amount) => new Date(startOfDay(value).getTime() + amount * DAY);
const dateKey = (value) => { if (!value) return null; const d = startOfDay(value); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const eventDate = (event) => event.date || event.start || null;
const timeText = (value) => { if (!value) return null; const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };

export default function UpcomingSchedule({ events: eventsProp, isPreview = false }) {
  const { backendConfigured, plans, reminders } = useApp();
  const taskEvents = plans.flatMap((plan) => plan.days.flatMap((day) => day.tasks.map((task) => ({
    id: `task-${plan.id}-${task.id}`, planId: plan.id, title: task.title, date: task.scheduledDate,
    start: task.scheduledTime ? `${task.scheduledDate}T${task.scheduledTime}:00` : undefined,
    end: task.scheduledEndTime ? `${task.scheduledDate}T${task.scheduledEndTime}:00` : undefined,
    durationMinutes: task.durationMinutes, status: task.completed ? 'completed' : 'pending',
  }))));
  const reminderEvents = (reminders?.events || []).map((reminder) => ({
    ...reminder,
    isReminder: true,
    status: reminder.status || 'pending',
  }));
  const events = eventsProp ?? [...taskEvents, ...reminderEvents];
  const today = useMemo(() => startOfDay(new Date()), []);
  const [rangeOffset, setRangeOffset] = useState(0);
  const [selectedKey, setSelectedKey] = useState(dateKey(today));
  // Show today through the next six days by default so upcoming deadlines
  // such as Oct 28 are visible without requiring an extra navigation click.
  const dates = Array.from({ length: 7 }, (_, index) => addDays(today, rangeOffset * 7 + index));
  const selectedEvents = events.filter((event) => dateKey(eventDate(event)) === selectedKey).sort((a, b) => String(eventDate(a)).localeCompare(String(eventDate(b))));
  const connected = backendConfigured;
  const goToRange = (direction) => { const next = rangeOffset + direction; setRangeOffset(next); setSelectedKey(dateKey(addDays(today, next * 7))); };
  const goToday = () => { setRangeOffset(0); setSelectedKey(dateKey(today)); };
  return (
    <section className="card schedule-card" aria-labelledby="schedule-title">
      <div className="card-head schedule-head"><div><h2 className="card-title" id="schedule-title">Task calendar</h2><p className="field-hint">Select a date to see scheduled work</p></div><span className="schedule-connection" data-connected={connected}><span className="schedule-dot" aria-hidden="true" /> {isPreview ? 'Preview calendar' : connected ? 'TaskPilot calendar' : 'Backend not configured'}</span></div>
      <div className="schedule-toolbar"><button type="button" className="icon-btn" onClick={() => goToRange(-1)} aria-label="Previous dates"><ArrowLeft size={16} /></button><button type="button" className="btn btn-secondary btn-sm" onClick={goToday} disabled={rangeOffset === 0}><RotateCcw size={14} /> Today</button><button type="button" className="icon-btn" onClick={() => goToRange(1)} aria-label="Next dates"><ArrowRight size={16} /></button></div>
      <div className="schedule-timeline" role="list" aria-label="Schedule dates">{dates.map((d) => { const key = dateKey(d); const isToday = key === dateKey(today); const selected = key === selectedKey; const hasEvents = events.some((event) => dateKey(eventDate(event)) === key); return <button type="button" key={key} className={`schedule-date${isToday ? ' today' : ''}${selected ? ' selected' : ''}`} onClick={() => setSelectedKey(key)} aria-current={isToday ? 'date' : undefined} aria-pressed={selected}><span>{d.toLocaleDateString(undefined, { weekday: 'short' })}</span><strong>{d.getDate()}</strong><i className={hasEvents ? 'has-events' : ''} /></button>; })}</div>
      <div className="schedule-events" aria-live="polite">{selectedEvents.length ? selectedEvents.map((event) => event.isReminder ? <div className="schedule-event reminder-event" key={event.id}><span className="schedule-event-time"><Bell size={14} /> {timeText(event.start) || 'Time not set'}</span><strong>{event.title}</strong><span className="schedule-event-meta">{event.reminderType ? `${event.reminderType[0].toUpperCase()}${event.reminderType.slice(1)} reminder` : 'Reminder'}</span></div> : <Link className="schedule-event" to={`/plans/${event.planId}`} key={event.id}><span className="schedule-event-time"><Clock3 size={14} /> {timeText(event.start) || 'Time not set'}{event.end ? `–${timeText(event.end)}` : ''}</span><strong>{event.title}</strong><span className="schedule-event-meta">{event.durationMinutes ? `${event.durationMinutes} min` : ''}{event.status === 'completed' ? ' · Completed' : ''}</span><ExternalLink size={14} /></Link>) : <EmptyState icon={<CalendarDays size={22} />} title="Nothing scheduled">{connected ? 'There is no saved task or reminder for this date.' : 'Connect the backend to load saved tasks and reminders.'}</EmptyState>}</div>
      <p className="schedule-note"><ShieldAlert size={14} /> Scheduled tasks and reminders come from your saved TaskPilot data. Completed and overdue work remains visible.</p>
    </section>
  );
}
