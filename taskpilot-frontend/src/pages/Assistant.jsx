import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, CalendarDays, Check, CircleAlert, CornerDownLeft, Edit3, LoaderCircle, Plus, RotateCcw, Sparkles, UserRound, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import Header from '../components/Header.jsx';
import { useApp, PREVIEW_READONLY_MESSAGE } from '../state/AppState.jsx';
import * as api from '../services/api.js';

const SUGGESTIONS = [
  'Help me plan my week.',
  'What tasks should I prioritize today?',
  'How am I progressing toward my goals?',
  'What is on my calendar tomorrow?',
  'I have a new goal. Help me create a plan.',
];

const CONVERSATION_KEY = 'taskpilot.conversationId';

// A static greeting rendered by the UI itself. It is not an AI reply and is never saved to the backend.
const welcome = (planMode = false) => ({
  id: `welcome-${planMode ? 'plan' : 'general'}`,
  role: 'assistant',
  text: planMode
    ? 'Let’s create a realistic plan together. What would you like to accomplish? Include a deadline or duration if you already know it.'
    : 'Hi! I’m TaskPilot’s planning assistant. I can answer questions, help create plans, review progress, and prepare changes for your approval. What would you like to work on?',
});

const ACTION_TITLES = {
  create_plan: 'Create a plan',
  reschedule_plan: 'Generate a revised schedule',
  create_reminder: 'Create a reminder',
  update_reminder: 'Update a reminder',
  delete_reminder: 'Delete a reminder',
  update_task_status: 'Update a task',
  review_plan: 'Review a plan',
};

const FIELD_LABELS = {
  goal: 'Goal',
  days_available: 'Days',
  hours_per_day: 'Hours/day',
  plan_id: 'Plan',
  remaining_days: 'Days left',
  title: 'Title',
  reminder_type: 'Type',
  date: 'Date',
  time: 'Time',
  notes: 'Notes',
  reminder_id: 'Reminder',
  task_id: 'Task',
  status: 'New status',
};

function readStoredConversationId() {
  try {
    const value = Number(localStorage.getItem(CONVERSATION_KEY));
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function storeConversationId(id) {
  try {
    if (id) localStorage.setItem(CONVERSATION_KEY, String(id));
    else localStorage.removeItem(CONVERSATION_KEY);
  } catch {
    /* storage unavailable: the conversation just won't resume after a reload */
  }
}

/** Attaches each saved action to the assistant message that proposed it. */
function buildMessages(messages, actions) {
  const byMessage = new Map(actions.filter((a) => a.messageId != null).map((a) => [`m-${a.messageId}`, a]));
  return messages.map((message) => (byMessage.has(message.id) ? { ...message, action: byMessage.get(message.id) } : message));
}

/** Human-readable rows for an action payload, resolving IDs against saved data so the user can verify what they approve. */
function describePayload(action, { plans, reminders }) {
  const plan = plans.find((p) => String(p.id) === String(action.payload.plan_id));
  return Object.entries(action.payload)
    .filter(([key, value]) => FIELD_LABELS[key] && value !== null && value !== '')
    .map(([key, value]) => {
      let text = String(value);
      if (key === 'plan_id') text = plan ? `#${value} · ${plan.goal}` : `#${value}`;
      if (key === 'task_id') {
        const task = plan?.days.flatMap((d) => d.tasks).find((t) => String(t.id) === String(value));
        text = task ? `#${value} · ${task.title}` : `#${value}`;
      }
      if (key === 'reminder_id') {
        const reminder = reminders.find((r) => r.id === `reminder-${value}`);
        text = reminder ? `#${value} · ${reminder.title}` : `#${value}`;
      }
      return [FIELD_LABELS[key], text];
    });
}

function ActionStatus({ action }) {
  const { status, result, payload } = action;
  if (status === 'rejected') return <>Rejected. This action was not run.</>;
  if (status === 'failed') return <>The action could not be completed{result?.error ? `: ${result.error}` : '.'}</>;
  switch (action.actionType) {
    case 'create_plan':
      return <>Plan created — it is still a draft until you approve it. {result?.plan?.id != null && <Link to={`/plans/${result.plan.id}/review`}>Review the plan</Link>}</>;
    case 'reschedule_plan':
      return <>Revised schedule proposed — it is not applied yet. {payload.plan_id != null && <Link to={`/plans/${payload.plan_id}/reschedule`}>Review the proposal</Link>}</>;
    case 'create_reminder':
      return <>Reminder created.</>;
    case 'update_reminder':
      return <>Reminder updated.</>;
    case 'delete_reminder':
      return <>Reminder deleted.</>;
    case 'update_task_status':
      return <>Task updated.</>;
    case 'review_plan':
      return <>Plan {payload.status === 'approved' ? 'approved' : 'rejected'}.</>;
    default:
      return <>Action completed.</>;
  }
}

function Message({ message, onProposalAction, context }) {
  const isAssistant = message.role === 'assistant';
  const action = message.action;
  const rows = action ? describePayload(action, context) : [];
  return (
    <article className={`assistant-message ${isAssistant ? 'assistant' : 'user'}`}>
      <div className="assistant-avatar" aria-hidden="true">{isAssistant ? <Bot size={17} /> : <UserRound size={17} />}</div>
      <div className="assistant-message-body">
        <div className="assistant-message-meta">{isAssistant ? 'TaskPilot assistant' : 'You'}</div>
        <p style={{ whiteSpace: 'pre-wrap' }}>{message.text}</p>
        {action && (
          <div className="assistant-proposal" aria-label="Proposed action">
            <div className="assistant-proposal-head"><Sparkles size={16} aria-hidden="true" /><strong>Proposed action</strong></div>
            <h3>{ACTION_TITLES[action.actionType] ?? action.actionType}</h3>
            {action.status === 'pending' && <p className="assistant-proposal-meta"><CalendarDays size={14} aria-hidden="true" /> Waiting for your approval — nothing has changed yet</p>}
            {rows.length > 0 && (
              <ul className="assistant-task-preview">
                {rows.map(([label, value]) => <li key={label}><span>{label}</span><strong>{value}</strong></li>)}
              </ul>
            )}
            {action.explanation && <p className="assistant-proposal-note"><strong>Why:</strong> {action.explanation}</p>}
            {action.status === 'pending' && !action.unknown ? (
              <>
                <div className="assistant-proposal-actions">
                  <button type="button" className="btn btn-primary btn-sm" disabled={action.busy} onClick={() => onProposalAction('approve', message.id)}>
                    {action.busy ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />} Approve
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={action.busy} onClick={() => onProposalAction('edit', message.id)}><Edit3 size={15} aria-hidden="true" /> Edit details</button>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={action.busy} onClick={() => onProposalAction('reject', message.id)}><X size={14} aria-hidden="true" /> Reject</button>
                </div>
                {action.error && <p className="assistant-proposal-status" role="alert"><CircleAlert size={15} aria-hidden="true" /> {action.error}</p>}
              </>
            ) : (
              <p className="assistant-proposal-status" role="status">
                <CircleAlert size={15} aria-hidden="true" />
                <span>{action.unknown ? action.error : <ActionStatus action={action} />}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export default function Assistant() {
  const [searchParams] = useSearchParams();
  const { backendConfigured, isPreview, plans, reminders, refreshPlans, refreshReminders } = useApp();
  const planMode = searchParams.get('mode') === 'create';
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState(null); // { message, retryText? }
  const [showSuggestions, setShowSuggestions] = useState(true);
  const conversationIdRef = useRef(readStoredConversationId());
  const inFlight = useRef(false); // blocks duplicate submissions while a request is running
  const actionsInFlight = useRef(new Set());
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const stickToBottom = useRef(true);

  /* Restore the saved conversation (messages + proposed actions) when the page opens. */
  useEffect(() => {
    const id = conversationIdRef.current;
    if (!id || !backendConfigured) return undefined;
    let cancelled = false;
    setRestoring(true);
    api.getConversation(id)
      .then((history) => { if (!cancelled) setMessages(buildMessages(history.messages, history.actions)); })
      .catch((err) => {
        if (cancelled) return;
        if (err.status === 404) { conversationIdRef.current = null; storeConversationId(null); }
        else setError({ message: `Could not restore your previous conversation. ${err.message}` });
      })
      .finally(() => { if (!cancelled) setRestoring(false); });
    return () => { cancelled = true; };
  }, [backendConfigured]);

  useEffect(() => {
    setDraft('');
    setError(null);
  }, [planMode]);

  const connectionLabel = useMemo(
    () => isPreview ? 'Preview sample mode' : backendConfigured ? 'Connected to the TaskPilot assistant' : 'Backend not configured — the assistant is unavailable',
    [backendConfigured, isPreview],
  );

  const patchMessage = useCallback((messageId, change) => {
    setMessages((current) => current.map((m) => (m.id === messageId ? { ...m, ...(typeof change === 'function' ? change(m) : change) } : m)));
  }, []);

  async function ensureConversation() {
    if (conversationIdRef.current) return conversationIdRef.current;
    const created = await api.createConversation();
    conversationIdRef.current = created.id;
    storeConversationId(created.id);
    return created.id;
  }

  async function sendMessage(value = draft, { retry = false } = {}) {
    const text = value.trim();
    if (!text || inFlight.current) return;
    if (isPreview) { setError({ message: PREVIEW_READONLY_MESSAGE }); return; }
    inFlight.current = true;
    setError(null);
    setIsThinking(true);
    const userId = `user-${Date.now()}`;
    if (!retry) {
      setDraft('');
      setMessages((current) => [...current, { id: userId, role: 'user', text }]);
    }
    try {
      let conversationId = await ensureConversation();
      let result;
      try {
        result = await api.sendChatMessage(conversationId, text);
      } catch (err) {
        // The saved conversation no longer exists on the backend: start a fresh one and resend once.
        if (err.status !== 404) throw err;
        conversationIdRef.current = null;
        storeConversationId(null);
        conversationId = await ensureConversation();
        setMessages((current) => current.filter((m) => m.role === 'user').slice(-1));
        result = await api.sendChatMessage(conversationId, text);
      }
      setMessages((current) => [...current, { ...result.assistantMessage, ...(result.action ? { action: result.action } : {}) }]);
    } catch (err) {
      setError({ message: err?.message || 'The assistant could not reply. Try again.', retryText: text });
    } finally {
      inFlight.current = false;
      setIsThinking(false);
    }
  }

  async function handleProposalAction(decision, messageId) {
    const message = messages.find((m) => m.id === messageId);
    const action = message?.action;
    if (!action || action.status !== 'pending') return;
    if (decision === 'edit') { inputRef.current?.focus(); return; }
    if (actionsInFlight.current.has(action.id) || isPreview) return;

    const conversationId = conversationIdRef.current;
    actionsInFlight.current.add(action.id);
    patchMessage(messageId, (m) => ({ action: { ...m.action, busy: true, error: null } }));
    try {
      const outcome = await api.confirmChatAction(conversationId, action.id, decision === 'approve' ? 'confirm' : 'reject');
      patchMessage(messageId, (m) => ({ action: { ...m.action, busy: false, error: null, status: outcome.status, result: outcome.result } }));
      if (outcome.status === 'confirmed') { refreshPlans(); refreshReminders(); }
    } catch (err) {
      // Re-read the saved action: the backend is the source of truth for whether anything ran.
      let synced = null;
      try {
        const history = await api.getConversation(conversationId);
        synced = history.actions.find((a) => a.id === action.id) ?? null;
      } catch { /* handled below */ }
      if (synced && synced.status !== 'pending') {
        patchMessage(messageId, (m) => ({ action: { ...m.action, busy: false, error: null, status: synced.status, result: synced.result ?? { error: err.message } } }));
        if (synced.status === 'confirmed') { refreshPlans(); refreshReminders(); }
      } else if (synced) {
        patchMessage(messageId, (m) => ({ action: { ...m.action, busy: false, error: err.message } }));
      } else {
        patchMessage(messageId, (m) => ({ action: { ...m.action, busy: false, unknown: true, error: `${err.message} The result could not be verified — reload the conversation before trying again.` } }));
      }
    } finally {
      actionsInFlight.current.delete(action.id);
    }
  }

  function startNewConversation() {
    if (inFlight.current) return;
    conversationIdRef.current = null;
    storeConversationId(null);
    setMessages([]);
    setDraft('');
    setError(null);
  }

  // Keep the newest message, proposal or error in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, isThinking, restoring, error]);

  const context = { plans, reminders: reminders.events };
  const shownMessages = [welcome(planMode), ...messages];

  return (
    <div className="page assistant-page">
      <Header title="AI Assistant" subtitle="Plan, prioritize, and review changes through a natural conversation." icon={<span className="assistant-title-icon"><Bot size={22} aria-hidden="true" /></span>} actions={<button type="button" className="btn btn-secondary btn-sm" onClick={startNewConversation}><Plus size={16} aria-hidden="true" /> New conversation</button>} />
      <div className="assistant-mode-banner" role="status"><Sparkles size={16} aria-hidden="true" /><span><strong>{connectionLabel}.</strong> Proposed changes only run after you approve them, and the UI never reports success without backend confirmation.</span></div>
      <section className="assistant-shell card" aria-label="TaskPilot conversation">
        <div className="assistant-conversation" aria-live="polite" ref={scrollRef} onScroll={(event) => {
          const el = event.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}>
          {shownMessages.map((message) => <Message key={message.id} message={message} onProposalAction={handleProposalAction} context={context} />)}
          {restoring && <div className="assistant-thinking" role="status"><LoaderCircle size={17} className="spin" aria-hidden="true" /> Loading your conversation…</div>}
          {isThinking && <div className="assistant-thinking" role="status"><LoaderCircle size={17} className="spin" aria-hidden="true" /> Thinking through that…</div>}
          {error && <div className="assistant-error" role="alert"><CircleAlert size={17} aria-hidden="true" /><span>{error.message}</span>{error.retryText && <button type="button" className="btn btn-secondary btn-sm" disabled={isThinking} onClick={() => sendMessage(error.retryText, { retry: true })}><RotateCcw size={14} aria-hidden="true" /> Retry</button>}<button type="button" className="btn btn-ghost btn-sm" onClick={() => setError(null)}>Dismiss</button></div>}
        </div>
        <div className="assistant-suggestions" aria-label="Suggested prompts">
          <button type="button" className="btn btn-ghost btn-sm assistant-suggestions-toggle" aria-expanded={showSuggestions} onClick={() => setShowSuggestions((value) => !value)}>
            {showSuggestions ? 'Hide suggestions' : 'Show suggestions'}
          </button>
          {showSuggestions && <div className="assistant-suggestion-list"><span className="field-hint">Try asking</span>{SUGGESTIONS.map((suggestion) => <button key={suggestion} type="button" className="suggestion" onClick={() => sendMessage(suggestion)} disabled={isThinking || restoring}>{suggestion}</button>)}</div>}
        </div>
        <form className="assistant-composer" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
          <label className="sr-only" htmlFor="assistant-input">Message the TaskPilot assistant</label>
          <textarea id="assistant-input" ref={inputRef} className="textarea" rows={2} placeholder="Tell me what you want to accomplish…" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } }} disabled={isThinking} />
          <button type="submit" className="btn btn-primary assistant-send" disabled={!draft.trim() || isThinking || restoring}>{isThinking ? <LoaderCircle size={17} className="spin" aria-hidden="true" /> : <CornerDownLeft size={17} aria-hidden="true" />} Send</button>
        </form>
        <p className="assistant-footnote"><CornerDownLeft size={13} aria-hidden="true" /> Press Enter to send. Use Shift + Enter for a new line.</p>
      </section>
    </div>
  );
}
