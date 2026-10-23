/**
 * TaskPilot API service — the ONLY place HTTP requests live.
 *
 * Wired to the Flask backend's real routes (see run.py). Backend field names and
 * ID types stay contained in this file: `normalizePlan` maps the backend plan
 * into the frontend plan shape below, so pages and components never see raw JSON.
 *
 * BACKEND → FRONTEND MAPPING
 *   GET   /api/health                                         checkHealth()
 *   GET   /api/plans (+ GET /api/plans/<id> per plan)         listPlans()   (list returns summaries without tasks)
 *   GET   /api/plans/<id>                                     getPlan()
 *   POST  /api/plans                                          createPlan()
 *   PATCH /api/plans/<id>/status                              approvePlan() / rejectPlan()
 *   PATCH /api/plans/<id>/tasks/<task_id>                     updateTaskStatus()
 *   POST  /api/plans/<id>/reschedule                          requestReschedule()
 *   GET   /api/plans/<id>/reschedule/<proposal_id>            (inside getPlan, for a remembered pending proposal)
 *   POST  /api/plans/<id>/reschedule/<proposal_id>/review     acceptReschedule() / rejectReschedule()
 *   GET   /api/reminders/upcoming                             getUpcomingSchedule()
 *   POST  /api/conversations                                  createConversation()
 *   GET   /api/conversations                                  listConversations()
 *   GET   /api/conversations/<id>                             getConversation()
 *   POST  /api/conversations/<id>/messages                    sendChatMessage()   (Gemini runs on the backend)
 *   POST  /api/conversations/<id>/actions/<action_id>/confirm confirmChatAction()
 *
 * FRONTEND PLAN SHAPE (what every page expects):
 * {
 *   id: string, goal: string, title?: string, summary?: string,
 *   status: 'pending' | 'approved' | 'rejected',
 *   rescheduleCount?: number,         // not provided by the backend (no list of past proposals)
 *   availableDays: number, hoursPerDay: number, createdAt?: string (ISO),
 *   days: [{ id, label, title?, tasks: [{ id, title, durationMinutes, priority, completed, completedAt? }] }],
 *   proposal?: null | { id, generatedAt?, changes[], original{remainingDays,hoursPerDay},
 *                       revised{remainingDays,hoursPerDay}, tasksMoved, newTasks, totalTasks, days[] }
 * }
 *
 * KNOWN BACKEND LIMITS (handled honestly, nothing is invented):
 *  - Plans have no title/summary: the goal is used as the title.
 *  - Tasks have no completion timestamp: `completedAt` is omitted.
 *  - There is no endpoint listing a plan's reschedule proposals, so the id of a pending
 *    proposal is remembered in localStorage and re-fetched (and dropped once it is no
 *    longer pending).
 *  - There are no Google Calendar endpoints. The "upcoming schedule" shows the backend's
 *    saved reminders only.
 */

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
const HEALTH_PATH = (import.meta.env.VITE_API_HEALTH_PATH || '/api/health').trim();

export const isBackendConfigured = Boolean(BASE_URL);

const DEFAULT_TIMEOUT_MS = 20_000;
const AI_TIMEOUT_MS = 180_000; // Groq-backed requests can still be delayed by provider limits

export class ApiError extends Error {
  constructor(message, { status, code, data } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

/** Generic JSON request helper. Throws ApiError with the backend's own error text when available. */
async function request(path, { method = 'GET', body, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!isBackendConfigured) {
    throw new ApiError('The backend is not configured (VITE_API_BASE_URL is empty).', { code: 'NOT_CONFIGURED' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      signal: controller.signal,
      headers: body !== undefined ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    clearTimeout(timer);
    if (controller.signal.aborted && !signal?.aborted) {
      throw new ApiError('The backend took too long to respond. The request may still have been processed — refresh to check.', { code: 'TIMEOUT' });
    }
    if (err?.name === 'AbortError') throw new ApiError('The request was cancelled.', { code: 'ABORTED' });
    throw new ApiError('Could not reach the backend. Check that it is running and reachable.', { code: 'NETWORK' });
  }
  clearTimeout(timer);

  let data = null;
  let parseFailed = false;
  try {
    data = await response.json();
  } catch {
    parseFailed = true;
  }

  if (!response.ok) {
    const fromBody = data && typeof data === 'object' ? data.error || data.result?.error || data.message : null;
    throw new ApiError(typeof fromBody === 'string' && fromBody ? fromBody : `The backend returned an error (HTTP ${response.status}).`, {
      status: response.status,
      code: 'HTTP',
      data,
    });
  }
  if (parseFailed || data === null || typeof data !== 'object') {
    throw new ApiError('The backend returned a response the app could not read.', { status: response.status, code: 'MALFORMED' });
  }
  return data;
}

function requireField(data, field, operation) {
  if (data[field] === undefined || data[field] === null) {
    throw new ApiError(`${operation}: the backend response was missing "${field}".`, { code: 'MALFORMED', data });
  }
  return data[field];
}

/* ───────── Normalisation ───────── */

/** SQLite CURRENT_TIMESTAMP is UTC "YYYY-MM-DD HH:MM:SS" with no zone marker. */
function toIso(value) {
  if (typeof value !== 'string' || !value) return undefined;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(' ', 'T')}Z` : value;
  return Number.isNaN(new Date(iso).getTime()) ? undefined : iso;
}

function normalizeTask(task) {
  const hours = Number(task.duration_hours);
  return {
    id: String(task.task_id),
    title: String(task.title ?? 'Untitled task'),
    durationMinutes: Number.isFinite(hours) ? Math.round(hours * 60) : 0,
    priority: ['high', 'medium', 'low'].includes(task.priority) ? task.priority : 'medium',
    completed: task.status === 'completed',
    completedAt: toIso(task.completed_at),
    scheduledDate: task.scheduled_date || null,
    scheduledTime: task.scheduled_time || null,
    scheduledEndTime: task.scheduled_end_time || null,
    description: String(task.description || ''),
  };
}

/** Groups tasks by their actual scheduled date; legacy day numbers are only a fallback. */
function groupDays(tasks) {
  const byDay = new Map();
  for (const task of Array.isArray(tasks) ? tasks : []) {
    const day = Number.isInteger(task.day) ? task.day : 1;
    const scheduledDate = typeof task.scheduled_date === 'string' && task.scheduled_date
      ? task.scheduled_date
      : null;
    const key = scheduledDate ? `date:${scheduledDate}` : `day:${day}`;
    if (!byDay.has(key)) byDay.set(key, { day, scheduledDate, tasks: [] });
    byDay.get(key).tasks.push(normalizeTask(task));
  }
  return [...byDay.values()]
    .sort((a, b) => {
      if (a.scheduledDate && b.scheduledDate) return a.scheduledDate.localeCompare(b.scheduledDate);
      if (a.scheduledDate) return -1;
      if (b.scheduledDate) return 1;
      return a.day - b.day;
    })
    .map(({ day, scheduledDate, tasks: tasksForDay }) => {
      return { id: scheduledDate ? `date-${scheduledDate}` : `day-${day}`, label: scheduledDate ? new Date(`${scheduledDate}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) : `Day ${day}`, date: scheduledDate || null, tasks: tasksForDay };
    });
}

/** Backend plan → frontend plan. `proposal` is an already-normalised pending proposal (or null). */
function normalizePlan(raw, proposal = null) {
  const availability = raw.availability || {};
  const availabilitySlots = Array.isArray(availability) ? availability : [];
  const totalAvailableHours = availabilitySlots.reduce(
    (total, slot) => total + (Number(slot?.hours) || 0),
    0,
  );
  return {
    id: String(raw.id),
    goal: String(raw.goal ?? ''),
    status: ['pending', 'approved', 'rejected'].includes(raw.status) ? raw.status : 'pending',
    availableDays: Number(raw.days_available) || 0,
    hoursPerDay: Number(raw.hours_per_day) || 0,
    createdAt: toIso(raw.created_at),
    availability,
    totalAvailableHours,
    hasVariedAvailability: availabilitySlots.length > 0,
    days: groupDays(raw.tasks),
    proposal,
  };
}

/** Backend reschedule proposal → frontend proposal, diffed against the plan's current tasks. */
function normalizeProposal(rawProposal, rawPlan) {
  const current = new Map((rawPlan.tasks ?? []).map((t) => [t.task_id, t]));
  const proposed = Array.isArray(rawProposal.tasks) ? rawProposal.tasks : [];
  const changes = [];
  let moved = 0;
  for (const task of proposed) {
    const before = current.get(task.task_id);
    if (!before) continue;
    const dateChanged = before.scheduled_date !== task.scheduled_date;
    const timeChanged = (before.scheduled_time || null) !== (task.scheduled_time || null)
      || (before.scheduled_end_time || null) !== (task.scheduled_end_time || null);
    if (before.day !== task.day || dateChanged || timeChanged) {
      moved += 1;
      const destination = task.scheduled_date
        ? new Date(`${task.scheduled_date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : `Day ${task.day}`;
      changes.push(`“${task.title}” moves to ${destination}${task.scheduled_time ? ` at ${task.scheduled_time}` : ''}`);
    }
    if (before.priority !== task.priority) changes.push(`“${task.title}” priority changes from ${before.priority} to ${task.priority}`);
  }
  const pendingNow = (rawPlan.tasks ?? []).filter((t) => t.status !== 'completed');
  // The proposal view must not merge old schedule entries with the new
  // schedule. Tasks omitted by the AI are deferred and remain pending.
  const revisedTasks = proposed;
  const deferredTasks = pendingNow.filter((task) => !proposed.some((item) => item.task_id === task.task_id));
  const availability = Array.isArray(rawProposal.availability) ? rawProposal.availability : [];
  const revisedHours = availability.reduce((total, slot) => total + (Number(slot.hours) || 0), 0);
  if (deferredTasks.length) {
    changes.push(`${deferredTasks.length} task${deferredTasks.length === 1 ? '' : 's'} deferred because the new window is too short`);
  }
  return {
    id: String(rawProposal.id),
    generatedAt: toIso(rawProposal.created_at),
    changes,
    // The backend does not record the original deadline window; the last scheduled day of the unfinished tasks stands in.
    original: { remainingDays: pendingNow.reduce((m, t) => Math.max(m, t.day || 0), 0), hoursPerDay: Number(rawPlan.hours_per_day) || 0 },
    revised: {
      remainingDays: availability.length || Number(rawProposal.remaining_days) || 0,
      hoursPerDay: revisedHours,
      totalHours: revisedHours,
    },
    tasksMoved: moved,
    newTasks: 0, // the backend never adds tasks when rescheduling
    totalTasks: proposed.length,
    deferredTasks: deferredTasks.length,
    days: groupDays(revisedTasks),
  };
}

/* ───────── Pending-proposal memory (the backend has no "list proposals" route) ───────── */

const PROPOSAL_KEY = 'taskpilot.pendingProposals';

function readProposalIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROPOSAL_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeProposalIds(map) {
  try {
    localStorage.setItem(PROPOSAL_KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable: the proposal simply will not survive a reload */
  }
}

function rememberProposal(planId, proposalId) {
  writeProposalIds({ ...readProposalIds(), [String(planId)]: proposalId });
}

function forgetProposal(planId) {
  const map = readProposalIds();
  delete map[String(planId)];
  writeProposalIds(map);
}

async function loadPendingProposal(rawPlan) {
  const proposalId = readProposalIds()[String(rawPlan.id)];
  if (!proposalId || rawPlan.status !== 'approved') return null;
  try {
    const data = await request(`/api/plans/${rawPlan.id}/reschedule/${proposalId}`);
    const proposal = data.proposal;
    if (!proposal || proposal.status !== 'pending') {
      forgetProposal(rawPlan.id);
      return null;
    }
    return normalizeProposal(proposal, rawPlan);
  } catch (err) {
    if (err.status === 404) forgetProposal(rawPlan.id);
    return null; // a transient failure must not hide the plan itself
  }
}

/* ───────── Health ───────── */

/**
 * Returns { status }: 'unconfigured' | 'connected' | 'disconnected'.
 * 'connected' means GET /api/health succeeded. It does NOT prove that the Gemini key works.
 */
export async function checkHealth() {
  if (!isBackendConfigured) return { status: 'unconfigured' };
  if (!HEALTH_PATH) return { status: 'unverified' };
  try {
    const data = await request(HEALTH_PATH, { timeoutMs: 5000 });
    return { status: data.status === 'ok' ? 'connected' : 'disconnected' };
  } catch {
    return { status: 'disconnected' };
  }
}

/* ───────── Plans ───────── */

async function fetchRawPlan(planId) {
  const data = await request(`/api/plans/${planId}`);
  return requireField(data, 'plan', 'Loading the plan');
}

export async function listPlans() {
  const data = await request('/api/plans');
  const summaries = requireField(data, 'plans', 'Loading plans');
  // The list route returns summaries without tasks, so each plan is fetched in full.
  return Promise.all(summaries.map((summary) => getPlan(summary.id)));
}

export async function getPlan(planId) {
  const raw = await fetchRawPlan(planId);
  return normalizePlan(raw, await loadPendingProposal(raw));
}

export async function deletePlan(planId) {
  return request(`/api/plans/${planId}`, { method: 'DELETE' });
}

export async function createPlan(payload) {
  const data = await request('/api/plans', {
    method: 'POST',
    timeoutMs: AI_TIMEOUT_MS,
    body: {
      goal: payload.goal,
      days_available: Number(payload.availableDays),
      hours_per_day: Number(payload.hoursPerDay),
    },
  });
  return normalizePlan(requireField(data, 'plan', 'Creating the plan'));
}

export async function approvePlan(planId) {
  return request(`/api/plans/${planId}/status`, { method: 'PATCH', body: { status: 'approved' } });
}

export async function rejectPlan(planId) {
  return request(`/api/plans/${planId}/status`, { method: 'PATCH', body: { status: 'rejected' } });
}

export async function updateTaskStatus(planId, taskId, completed) {
  return request(`/api/plans/${planId}/tasks/${taskId}`, {
    method: 'PATCH',
    body: { status: completed ? 'completed' : 'pending' },
  });
}

export async function updateTaskSchedule(planId, taskId, schedule) {
  return request(`/api/plans/${planId}/tasks/${taskId}/schedule`, {
    method: 'PATCH',
    body: {
      scheduled_date: schedule.scheduledDate,
      scheduled_time: schedule.scheduledTime || null,
      scheduled_end_time: schedule.scheduledEndTime || null,
    },
  });
}

/* ───────── Rescheduling ───────── */

/**
 * Ask the backend (Gemini) for a reschedule PROPOSAL; nothing is applied.
 * The backend needs `remaining_days`, which the UI does not collect. It is derived from the
 * plan: the days_available minus whole days elapsed since the plan was created (minimum 1).
 */
export async function requestReschedule(planId, availability) {
  const data = await request(`/api/plans/${planId}/reschedule`, {
    method: 'POST',
    timeoutMs: AI_TIMEOUT_MS,
    body: { remaining_days: availability.length, availability },
  });
  const proposal = requireField(data, 'proposal', 'Requesting a revised schedule');
  rememberProposal(planId, proposal.id);
  return data;
}

export async function acceptReschedule(planId, proposalId) {
  try {
    const data = await request(`/api/plans/${planId}/reschedule/${proposalId}/review`, { method: 'POST', body: { decision: 'accept' } });
    forgetProposal(planId);
    return data;
  } catch (err) {
    // Reviewed or stale proposals can never be applied: stop offering them.
    if (err.status === 409 || err.status === 404) forgetProposal(planId);
    throw err;
  }
}

export async function rejectReschedule(planId, proposalId) {
  try {
    const data = await request(`/api/plans/${planId}/reschedule/${proposalId}/review`, { method: 'POST', body: { decision: 'reject' } });
    forgetProposal(planId);
    return data;
  } catch (err) {
    if (err.status === 409 || err.status === 404) forgetProposal(planId);
    throw err;
  }
}

/* ───────── Upcoming schedule (reminders) ───────── */

/**
 * Upcoming items from GET /api/reminders/upcoming, shaped for <UpcomingSchedule>.
 * These are TaskPilot reminders, not Google Calendar events.
 */
export async function getCalendar(startDate, endDate) {
  const data = await request(`/api/calendar?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`);
  return requireField(data, 'tasks', 'Loading calendar');
}
export async function getActivity() {
  const data = await request('/api/activity');
  return requireField(data, 'events', 'Loading activity');
}

export async function getUpcomingSchedule() {
  const data = await request('/api/reminders/upcoming');
  const reminders = requireField(data, 'reminders', 'Loading upcoming reminders');
  return reminders.map((r) => {
    const time = typeof r.reminder_time === 'string' && r.reminder_time ? r.reminder_time : null;
    // Local (zone-less) timestamps keep the reminder on the calendar day the user entered.
    const local = `${r.reminder_date}T${time ?? '00:00'}:00`;
    return {
      id: `reminder-${r.id}`,
      title: r.title,
      date: local,
      start: time ? local : undefined,
      reminderType: r.reminder_type,
      location: r.reminder_type ? r.reminder_type[0].toUpperCase() + r.reminder_type.slice(1) : undefined,
    };
  });
}

/** The backend exposes no Google Calendar endpoints, so there is nothing to call. */
export async function requestCalendarAction() {
  throw new ApiError('The backend has no Google Calendar endpoints, so calendar changes are not supported.', { code: 'NOT_SUPPORTED' });
}

/* ───────── Assistant conversations (Gemini runs on the backend) ───────── */

function normalizeChatMessage(raw) {
  return { id: `m-${raw.id}`, serverId: raw.id, role: raw.role === 'user' ? 'user' : 'assistant', text: String(raw.content ?? ''), createdAt: toIso(raw.created_at) };
}

export function normalizeChatAction(raw) {
  return {
    id: raw.id,
    messageId: raw.message_id ?? null,
    actionType: raw.action_type,
    payload: raw.payload && typeof raw.payload === 'object' ? raw.payload : {},
    explanation: typeof raw.explanation === 'string' ? raw.explanation : null, // only present in the live send response
    status: raw.status ?? 'pending', // pending | confirmed | rejected | failed
    result: raw.result ?? null,
  };
}

export async function createConversation(title) {
  const data = await request('/api/conversations', { method: 'POST', body: title ? { title } : {} });
  const conversation = requireField(data, 'conversation', 'Starting a conversation');
  return { id: conversation.id, title: conversation.title };
}

export async function listConversations() {
  const data = await request('/api/conversations');
  return requireField(data, 'conversations', 'Loading conversations');
}

/** Full history: { conversation, messages[], actions[] } with each action attached to its message by messageId. */
export async function getConversation(conversationId) {
  const data = await request(`/api/conversations/${conversationId}`);
  const conversation = requireField(data, 'conversation', 'Loading the conversation');
  const actions = (Array.isArray(data.actions) ? data.actions : []).map(normalizeChatAction);
  const messages = (Array.isArray(data.messages) ? data.messages : [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map(normalizeChatMessage);
  return { conversation: { id: conversation.id, title: conversation.title }, messages, actions };
}

/** Sends one user message; the backend saves it, calls Gemini and returns the assistant reply + optional proposed action. */
export async function sendChatMessage(conversationId, text) {
  const data = await request(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    timeoutMs: AI_TIMEOUT_MS,
    body: { message: text },
  });
  const reply = requireField(data, 'assistant_message', 'Sending the message');
  if (typeof reply.content !== 'string' || !reply.content.trim()) {
    throw new ApiError('The assistant returned an empty reply.', { code: 'MALFORMED', data });
  }
  return {
    userMessageId: data.user_message_id ?? null,
    assistantMessage: { id: `m-${reply.id}`, serverId: reply.id, role: 'assistant', text: reply.content },
    action: data.action ? { ...normalizeChatAction({ ...data.action, message_id: reply.id }) } : null,
  };
}

/**
 * Persist the user's decision on a proposed action. Nothing runs unless decision === 'confirm'.
 * Returns { status, result }. A confirmed reschedule_plan action creates a proposal, which is remembered
 * so the existing reschedule-review page can load it.
 */
export async function confirmChatAction(conversationId, actionId, decision) {
  if (decision !== 'confirm' && decision !== 'reject') throw new ApiError('Invalid decision.', { code: 'INVALID' });
  const data = await request(`/api/conversations/${conversationId}/actions/${actionId}/confirm`, {
    method: 'POST',
    timeoutMs: AI_TIMEOUT_MS,
    body: { decision },
  });
  const result = data.result ?? null;
  if (decision === 'confirm' && result?.proposal?.plan_id && result.proposal.id) {
    rememberProposal(result.proposal.plan_id, result.proposal.id);
  }
  return { status: data.status ?? (decision === 'reject' ? 'rejected' : 'confirmed'), result };
}

export { normalizePlan };
