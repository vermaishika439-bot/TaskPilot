import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, CircleAlert, Clock, Sparkles, LoaderCircle, Check, ShieldCheck } from 'lucide-react';
import Header from '../components/Header.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { useApp } from '../state/AppState.jsx';

const GOAL_MIN = 10;
const GOAL_MAX = 500;
const EXAMPLES = [
  'Prepare for my physics exam',
  'Build a personal website',
  'Learn React fundamentals',
  'Write a first draft of my thesis introduction',
];

function validate({ goal, days, hours }) {
  const errors = {};
  const trimmed = goal.trim();
  if (trimmed.length < GOAL_MIN) errors.goal = `Describe your goal in at least ${GOAL_MIN} characters.`;
  else if (trimmed.length > GOAL_MAX) errors.goal = `Keep your goal under ${GOAL_MAX} characters.`;

  const d = Number(days);
  if (days === '' || !Number.isInteger(d) || d < 1 || d > 365) errors.days = 'Enter a whole number of days from 1 to 365.';

  const h = Number(hours);
  if (hours === '' || Number.isNaN(h) || h < 0.5 || h > 16) errors.hours = 'Enter hours per day from 0.5 to 16.';
  return errors;
}

export default function CreatePlan() {
  const navigate = useNavigate();
  const { actions, backendConfigured } = useApp();
  const [goal, setGoal] = useState('');
  const [days, setDays] = useState('');
  const [hours, setHours] = useState('');
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitError(null);
    const found = validate({ goal, days, hours });
    setErrors(found);
    if (Object.keys(found).length) {
      document.getElementById(found.goal ? 'goal' : found.days ? 'days' : 'hours')?.focus();
      return;
    }

    setLoading(true);
    const result = await actions.createPlan({
      goal: goal.trim(),
      availableDays: Number(days),
      hoursPerDay: Number(hours),
    });
    setLoading(false);

    if (!result.ok) {
      setSubmitError(result.error);
      return;
    }
    // Real success only: the API returned the plan, which stays pending until approved.
    navigate(`/plans/${result.value.id}/review`);
  }

  return (
    <div className="page">
      <Header title="Create a New Plan" subtitle="Tell us your goal, how much time you have, and we’ll draft a plan for you to review." />

      {!backendConfigured && (
        <ErrorMessage tone="warn" title="Plan generation requires the backend">
          The TaskPilot backend isn’t configured yet, so a plan can’t be generated right now. You can fill in the form to see how
          it works.
        </ErrorMessage>
      )}

      <div className="create-grid">
        <form className="card form-card" onSubmit={onSubmit} noValidate aria-busy={loading}>
          <fieldset disabled={loading} className="form-fields">
            <legend className="sr-only">Plan details</legend>

            <div className="field">
              <label className="field-label" htmlFor="goal">
                What’s your goal?
              </label>
              <textarea
                id="goal"
                className="textarea"
                placeholder="e.g. Prepare for my physics exam, build a personal website, learn React…"
                value={goal}
                maxLength={GOAL_MAX + 50}
                onChange={(e) => setGoal(e.target.value)}
                aria-invalid={Boolean(errors.goal)}
                aria-describedby={`goal-hint${errors.goal ? ' goal-error' : ''}`}
                rows={4}
              />
              <div className="field-row">
                <span id="goal-hint" className="field-hint">
                  Be specific: include the topic, the outcome and any deadline.
                </span>
                <span className={`field-hint counter${goal.length > GOAL_MAX ? ' over' : ''}`} aria-live="off">
                  {goal.length}/{GOAL_MAX}
                </span>
              </div>
              {errors.goal && (
                <p id="goal-error" className="field-error" role="alert">
                  <CircleAlert size={14} aria-hidden="true" /> {errors.goal}
                </p>
              )}
              <div className="suggestions" role="group" aria-label="Example goals">
                {EXAMPLES.map((ex) => (
                  <button key={ex} type="button" className="suggestion" onClick={() => setGoal(ex)}>
                    {ex}
                  </button>
                ))}
              </div>
            </div>

            <div className="two-col">
              <div className="field">
                <label className="field-label" htmlFor="days">
                  Available days
                </label>
                <div className="input-wrap">
                  <CalendarDays size={17} aria-hidden="true" />
                  <input
                    id="days"
                    className="input"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="365"
                    step="1"
                    placeholder="e.g. 10"
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                    aria-invalid={Boolean(errors.days)}
                    aria-describedby={`days-hint${errors.days ? ' days-error' : ''}`}
                  />
                </div>
                <span id="days-hint" className="field-hint">
                  Number of days (1–365)
                </span>
                {errors.days && (
                  <p id="days-error" className="field-error" role="alert">
                    <CircleAlert size={14} aria-hidden="true" /> {errors.days}
                  </p>
                )}
              </div>

              <div className="field">
                <label className="field-label" htmlFor="hours">
                  Hours per day
                </label>
                <div className="input-wrap">
                  <Clock size={17} aria-hidden="true" />
                  <input
                    id="hours"
                    className="input"
                    type="number"
                    inputMode="decimal"
                    min="0.5"
                    max="16"
                    step="0.5"
                    placeholder="e.g. 2"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    aria-invalid={Boolean(errors.hours)}
                    aria-describedby={`hours-hint${errors.hours ? ' hours-error' : ''}`}
                  />
                </div>
                <span id="hours-hint" className="field-hint">
                  Hours you can dedicate daily (0.5–16)
                </span>
                {errors.hours && (
                  <p id="hours-error" className="field-error" role="alert">
                    <CircleAlert size={14} aria-hidden="true" /> {errors.hours}
                  </p>
                )}
              </div>
            </div>
          </fieldset>

          {submitError && (
            <ErrorMessage title="Couldn’t generate a plan">{submitError}</ErrorMessage>
          )}

          <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
            {loading ? (
              <>
                <LoaderCircle size={18} className="spin" aria-hidden="true" /> Generating plan…
              </>
            ) : (
              <>
                <Sparkles size={18} aria-hidden="true" /> Generate Plan
              </>
            )}
          </button>
        </form>

        <aside className="card side-card" aria-label="How planning works">
          <div className="side-art" aria-hidden="true">
            <Sparkles size={34} />
          </div>
          <h2 className="card-title">Let AI do the heavy lifting</h2>
          <ul className="checklist">
            {['Structured, day-by-day tasks', 'Time allocated to fit your hours', 'Personalised to your goal'].map((t) => (
              <li key={t}>
                <Check size={16} aria-hidden="true" /> {t}
              </li>
            ))}
          </ul>
          <p className="side-note">
            <ShieldCheck size={16} aria-hidden="true" />
            <span>
              You’re in control. The plan is only a draft until <strong>you</strong> approve it.
            </span>
          </p>
        </aside>
      </div>
    </div>
  );
}
