import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Info, Minus, Plus } from 'lucide-react';
import MoodMateMascot from './MoodMateMascot.jsx';
import { useApp } from '../state/AppState.jsx';
import { getCompanionState } from '../utils/getCompanionState.js';
import { COMPANION_DISCLAIMER, COMPANION_STATES, COMPANION_STATE_KEYS } from '../utils/companionContent.js';

/**
 * MoodMate companion card. State is recalculated from the plans it receives on every change,
 * is never stored, and is never sent anywhere. `variant="compact"` is used in side columns.
 */
export default function CompanionCard({ plans: plansProp, variant = 'full' }) {
  const { plans: allPlans, companionMinimized, setCompanionMinimized } = useApp();
  const plans = plansProp ?? allPlans;
  const [showWhy, setShowWhy] = useState(false);
  const [forced, setForced] = useState(''); // DEV-only design-review override
  const whyId = useId();

  // Recomputed when plan/task data changes. `Date.now()` is read once per recalculation.
  const inferred = useMemo(() => getCompanionState({ plans, now: Date.now() }), [plans]);
  const stateKey = forced || inferred.state;
  const isForced = Boolean(forced);
  const info = COMPANION_STATES[stateKey];
  const compact = variant === 'compact';

  if (companionMinimized) {
    return (
      <button
        type="button"
        className="mm-chip"
        onClick={() => setCompanionMinimized(false)}
        aria-label={`Show MoodMate. Currently ${info.label.toLowerCase()}.`}
      >
        <MoodMateMascot state={stateKey} size={34} decorative />
        <span>MoodMate</span>
        <Plus size={14} aria-hidden="true" />
      </button>
    );
  }

  return (
    <section className={`mm-card mm-tone-${stateKey}${compact ? ' compact' : ''}`} aria-label="MoodMate companion">
      <div className="mm-card-art">
        <MoodMateMascot state={stateKey} size={compact ? 72 : 92} decorative />
      </div>

      <div className="mm-card-body">
        <div className="mm-card-top">
          <span className="mm-eyebrow">MoodMate</span>
          <span className="mm-state-pill">{info.label}</span>
                    <button
            type="button"
            className="mm-icon-btn"
            onClick={() => setCompanionMinimized(true)}
            aria-label="Minimize MoodMate"
            title="Minimize"
          >
            <Minus size={15} aria-hidden="true" />
          </button>
        </div>

        <p className="mm-message" role="status">
          {info.message}
        </p>
        {!isForced && inferred.detail && !compact && <p className="mm-detail">{inferred.detail}</p>}
        {isForced && <p className="mm-detail">Forced for design review — not based on your data.</p>}

        {!isForced && inferred.actions.length > 0 && (
          <div className="mm-actions">
            {inferred.actions.map((action, i) => (
              <Link key={action.id} to={action.to} className={`btn btn-sm ${i === 0 ? 'btn-secondary' : 'btn-ghost'}`}>
                {action.label}
              </Link>
            ))}
          </div>
        )}

        <button
          type="button"
          className="mm-why-toggle"
          aria-expanded={showWhy}
          aria-controls={whyId}
          onClick={() => setShowWhy((v) => !v)}
        >
          <Info size={14} aria-hidden="true" /> Why this?
          <ChevronDown size={14} aria-hidden="true" className={showWhy ? 'open' : ''} />
        </button>

        {showWhy && (
          <div id={whyId} className="mm-why">
            {isForced ? (
              <p>This state was picked manually by the dev-only selector below.</p>
            ) : (
              <>
                <ul>
                  {isPreview && <li>These patterns come from preview sample data, not real activity.</li>}
                  {inferred.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                {inferred.notes.length > 0 && (
                  <>
                    <p className="mm-why-sub">Not used (data not available)</p>
                    <ul className="muted">
                      {inferred.notes.map((n) => (
                        <li key={n}>{n}</li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
            <p className="mm-disclaimer">{COMPANION_DISCLAIMER}</p>
          </div>
        )}

        {import.meta.env.DEV && !compact && (
          <label className="mm-dev">
            <span>Dev: force state</span>
            <select className="select" value={forced} onChange={(e) => setForced(e.target.value)}>
              <option value="">Inferred from data</option>
              {COMPANION_STATE_KEYS.map((k) => (
                <option key={k} value={k}>
                  {COMPANION_STATES[k].label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </section>
  );
}
