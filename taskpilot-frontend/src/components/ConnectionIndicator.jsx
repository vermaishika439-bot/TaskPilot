import { useApp } from '../state/AppState.jsx';

const LABELS = {
  unconfigured: { short: 'Backend not configured', long: 'Backend not configured' },
  unverified: { short: 'Backend not verified', long: 'Backend not verified' },
  checking: { short: 'Checking backend…', long: 'Checking backend…' },
  disconnected: { short: 'Backend disconnected', long: 'Backend disconnected' },
  connected: { short: 'Backend connected', long: 'Backend connected' },
};

const HINTS = {
  unconfigured: 'No API URL is set (VITE_API_BASE_URL). Plan generation and saving are unavailable.',
  unverified: 'An API URL is set, but no health check has confirmed the connection yet.',
  checking: 'Running a health check…',
  disconnected: 'The last health check failed.',
  connected: 'The last health check succeeded.',
};

export default function ConnectionIndicator() {
  const { health, recheckHealth } = useApp();
  const status = LABELS[health.status] ? health.status : 'unconfigured';
  const label = LABELS[status];

  return (
    <button
      type="button"
      className="conn"
      data-status={status}
      onClick={recheckHealth}
      title={`${HINTS[status]} Click to re-check.`}
      aria-label={`${label.long}. ${HINTS[status]} Activate to re-check.`}
    >
      <span className="conn-dot" aria-hidden="true" />
      <span className="conn-label-long">{label.long}</span>
    </button>
  );
}
