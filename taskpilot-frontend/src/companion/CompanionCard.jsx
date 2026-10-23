import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Info } from 'lucide-react';
import Mascot from './Mascot.jsx';
import { MOOD_COLORS } from './moods.js';
import { getCompanionState } from '../utils/getCompanionState.js';
import { COMPANION_DISCLAIMER, COMPANION_STATES, COMPANION_STATE_KEYS } from '../utils/companionContent.js';
import { useApp } from '../state/AppState.jsx';

/**
 * MoodMate sidebar tile: just the mascot, the feeling label and a "Why this?" button.
 * The supportive message, the reasons and any quick links live in the "Why this?" popover.
 * State is recalculated from `plans` whenever they change and is never stored.
 */
export default function CompanionCard({ plans }) {
  const { isPreview } = useApp();
  const whyId = useId();
  const rootRef = useRef(null);
  const [showWhy, setShowWhy] = useState(false);
  const [override, setOverride] = useState('auto'); // dev preview only

  const computed = useMemo(() => getCompanionState({ plans, now: Date.now() }), [plans]);

  const canOverride = import.meta.env.DEV && isPreview;
  const result =
    canOverride && override !== 'auto'
      ? {
          ...computed,
          state: override,
          label: COMPANION_STATES[override].label,
          message: COMPANION_STATES[override].message,
          detail: '',
          actions: [], // actions belong to the inferred state, so none are shown while forcing
          reasons: ['Chosen manually in preview mode — not inferred from data.'],
          notes: [],
        }
      : computed;

  // Close the popover on Escape or an outside click.
  useEffect(() => {
    if (!showWhy) return undefined;
    const onKey = (e) => e.key === 'Escape' && setShowWhy(false);
    const onDown = (e) => rootRef.current && !rootRef.current.contains(e.target) && setShowWhy(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [showWhy]);

  return (
    <section ref={rootRef} className="companion companion-sidebar" style={{ '--mood': MOOD_COLORS[result.state] }} aria-label="MoodMate companion">
      <div className="companion-art">
        <Mascot state={result.state} size={112} />
      </div>

      <span className="mood-label">{result.label}</span>

      <button
        type="button"
        className="btn btn-ghost btn-sm why-btn"
        aria-expanded={showWhy}
        aria-controls={whyId}
        onClick={() => setShowWhy((v) => !v)}
      >
        <Info size={15} aria-hidden="true" /> Why this?
      </button>

      {showWhy && (
        <div id={whyId} className="companion-why" role="group" aria-label="Why MoodMate chose this">
          {isPreview && <p className="field-hint">Preview data: not your real activity.</p>}
          <p className="why-message">{result.message}</p>
          {result.detail && <p className="companion-detail">{result.detail}</p>}
          <ul>
            {[...result.reasons, ...result.notes].map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {result.actions.length > 0 && (
            <div className="companion-actions">
              {result.actions.map((a, i) => (
                <Link key={a.id} to={a.to} className={`btn btn-sm ${i === 0 ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => setShowWhy(false)}>
                  {a.label}
                </Link>
              ))}
            </div>
          )}
          <p className="field-hint">{COMPANION_DISCLAIMER}</p>
          {canOverride && (
            <label className="companion-dev">
              <span>Preview mood (dev only)</span>
              <select className="select" value={override} onChange={(e) => setOverride(e.target.value)}>
                <option value="auto">Auto (from preview data)</option>
                {COMPANION_STATE_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {COMPANION_STATES[key].label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </section>
  );
}
