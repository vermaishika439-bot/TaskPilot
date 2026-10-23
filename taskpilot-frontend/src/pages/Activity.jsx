import { CircleAlert, CircleCheck, History } from 'lucide-react';
import Header from '../components/Header.jsx';
import EmptyState from '../components/EmptyState.jsx';
import LoadingState from '../components/LoadingState.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { useApp } from '../state/AppState.jsx';

export default function Activity() {
  const { activity, activityStatus, refreshActivity } = useApp();
  return (
    <div className="page">
      <Header title="Activity" subtitle="A persistent history of meaningful changes in TaskPilot." />
      <section className="card" aria-labelledby="log-title">
        <div className="card-head">
          <h2 className="card-title" id="log-title">Recent activity</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={refreshActivity} disabled={activityStatus === 'loading'}>Refresh</button>
        </div>
        {activityStatus === 'loading' && <LoadingState label="Loading activity…" />}
        {activityStatus === 'error' && <ErrorMessage title="Couldn’t load activity">The backend activity history is unavailable. Try refreshing.</ErrorMessage>}
        {activityStatus !== 'loading' && activityStatus !== 'error' && activity.length === 0 && (
          <EmptyState icon={<History size={24} />} title="Nothing yet">Meaningful actions such as creating plans, reviewing proposals, and completing tasks will appear here.</EmptyState>
        )}
        {activityStatus !== 'loading' && activity.length > 0 && (
          <ul className="log">
            {activity.map((entry) => (
              <li key={entry.id} className="log-item success">
                {entry.event_type?.includes('failed') ? <CircleAlert size={16} aria-hidden="true" /> : <CircleCheck size={16} aria-hidden="true" />}
                <span className="log-text">{entry.description}</span>
                <time dateTime={entry.created_at} className="field-hint">{new Date(entry.created_at.replace(' ', 'T') + 'Z').toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
