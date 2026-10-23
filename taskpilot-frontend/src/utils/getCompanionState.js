/**
 * MoodMate state calculation — pure, framework-free and unit-tested
 * (see getCompanionState.test.mjs, run with `npm test`).
 *
 * Infers a playful "productivity pattern" from plan/task data. It is NOT a measurement of
 * anyone's real mood or health, it is never stored, and it is recomputed from the data each time.
 *
 * Only fields that exist are used:
 *   always:   plan.status, plan.availableDays, plan.hoursPerDay, plan.proposal,
 *             task.completed, task.durationMinutes
 *   optional: plan.createdAt           -> enables time-based signals (workload vs. time left, inactivity)
 *             task.completedAt (ISO)   -> enables "recent activity" states
 *             plan.rescheduleCount     -> enables the "repeated schedule changes" signal
 * Missing or invalid values are skipped (and reported in `notes`). Nothing is invented.
 *
 * @param {{ plans: Array, now?: number|Date }} input
 * @returns {{
 *   state: string, label: string, message: string, detail: string,
 *   reasons: string[],   // why this state was chosen
 *   notes: string[],     // data limitations that were worked around
 *   actions: {id: string, label: string, to: string}[], // max 2, existing routes; never "create plan" (that lives in the nav/top bar)
 *   focusPlanId: string|null, hasProposal: boolean
 * }}
 */
import { allTasks, taskCounts } from './plan.js';
import { COMPANION_STATES, buildDetail } from './companionContent.js';

/** Deliberately conservative thresholds. */
export const THRESHOLDS = {
  recentWindowHours: 48, // what counts as a "recent" completion
  zoneCompletions: 3, // recent completions needed for in_the_zone
  overloadRatio: 1.25, // remaining work must exceed the time left by 25%
  inactiveDays: 7, // days with no completion (while work is pending) before "tired"
  repeatedReschedules: 2, // recorded schedule changes (while still behind) before "tired"
  milestonePercent: 75, // a running plan this far along earns "proud"
  milestoneMinDone: 3,
};

const HOUR = 3_600_000;
const DAY = 86_400_000;

const toMs = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
};
const positive = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Number(n) : null);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const hoursText = (min) => `${Math.round((min / 60) * 10) / 10} hrs`;
const titleOf = (p) => p.title || p.goal || 'your plan';
const byNewest = (a, b) => (toMs(b.createdAt) ?? 0) - (toMs(a.createdAt) ?? 0);

function analyse(plan, nowMs) {
  const tasks = allTasks(plan);
  const pending = tasks.filter((t) => !t.completed);
  const { done, total } = taskCounts(plan);

  // Only real, valid, non-future completion times count.
  const stamps = tasks
    .filter((t) => t.completed)
    .map((t) => toMs(t.completedAt))
    .filter((ms) => ms !== null && ms <= nowMs);
  const recentCount = stamps.filter((ms) => nowMs - ms <= THRESHOLDS.recentWindowHours * HOUR).length;
  const lastCompletion = stamps.length ? Math.max(...stamps) : null;

  const remainingMinutes = pending.reduce((sum, t) => sum + (Number(t.durationMinutes) || 0), 0);

  const created = toMs(plan.createdAt);
  const days = positive(plan.availableDays);
  const hours = positive(plan.hoursPerDay);
  let remainingDays = null;
  let capacityMinutes = null;
  if (created !== null && days && hours) {
    const elapsed = Math.max(0, Math.floor((nowMs - created) / DAY));
    remainingDays = Math.max(0, days - elapsed);
    capacityMinutes = remainingDays * hours * 60;
  }

  return {
    done,
    total,
    pendingCount: pending.length,
    progress: total === 0 ? 0 : Math.round((done / total) * 100),
    recentCount,
    hasTimestamps: stamps.length > 0,
    lastCompletion,
    remainingMinutes,
    remainingDays,
    capacityMinutes,
    ageDays: created === null ? null : Math.max(0, Math.floor((nowMs - created) / DAY)),
    hasCreated: created !== null,
    overloaded:
      capacityMinutes !== null && remainingMinutes > 0 && remainingMinutes > capacityMinutes * THRESHOLDS.overloadRatio,
    rescheduleCount: Number(plan.rescheduleCount) || 0,
  };
}

function actionsFor(state, focus) {
  const id = focus?.id ?? null;
  const planPath = id ? `/plans/${id}` : null;
  const proposal = focus?.proposal && planPath ? { id: 'proposal', label: 'Review proposal', to: `${planPath}/reschedule` } : null;
  const out = [];

  switch (state) {
    case 'curious':
      if (focus?.status === 'pending') out.push({ id: 'review', label: 'Review your plan', to: `${planPath}/review` });
      else if (planPath) out.push({ id: 'open', label: 'Open your plan', to: planPath });
      break;
    case 'calm':
      if (planPath) out.push({ id: 'open', label: 'Open active plan', to: planPath });
      break;
    case 'happy':
    case 'in_the_zone':
      if (planPath) out.push({ id: 'tasks', label: 'Review remaining tasks', to: planPath });
      break;
    case 'proud':
      if (planPath) out.push({ id: 'open', label: 'View plan', to: planPath });
      break;
    case 'overloaded':
      if (proposal) out.push(proposal);
      else if (planPath) out.push({ id: 'schedule', label: 'Review schedule', to: planPath });
      break;
    case 'tired':
      if (planPath) out.push({ id: 'tasks', label: 'See what’s left', to: planPath });
      break;
    case 'reset':
      out.push({ id: 'plans', label: 'See my plans', to: '/plans' });
      break;
    default:
      break;
  }

  // A waiting reschedule proposal is always offered.
  if (proposal && !out.some((a) => a.id === 'proposal')) out.push(proposal);
  return out.slice(0, 2);
}

export function getCompanionState({ plans = [], now = Date.now() } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const list = (Array.isArray(plans) ? plans : []).filter(Boolean).slice().sort(byNewest);

  const finish = (state, { context, focus = null, reasons = [], notes = [], vars = {} }) => ({
    state,
    label: COMPANION_STATES[state].label,
    message: COMPANION_STATES[state].message,
    detail: buildDetail(state, context, { title: focus ? titleOf(focus) : '', ...vars }),
    reasons,
    notes,
    actions: actionsFor(state, focus),
    focusPlanId: focus ? focus.id : null,
    hasProposal: Boolean(focus?.proposal),
  });

  if (list.length === 0) {
    return finish('curious', {
      context: 'no_plans',
      reasons: ['There are no plans yet, so there isn’t enough activity to infer anything.'],
    });
  }

  const approved = list.filter((p) => p.status === 'approved');
  const withWork = approved.filter((p) => taskCounts(p).pending > 0);
  const completed = approved.filter((p) => {
    const c = taskCounts(p);
    return c.total > 0 && c.pending === 0;
  });

  // A rejected plan is a prompt to reconsider, never a failure — and it only matters when it is
  // the newest plan and nothing else is in progress.
  if (list[0].status === 'rejected' && withWork.length === 0) {
    return finish('reset', {
      context: 'rejected',
      focus: null,
      reasons: [
        'Your newest plan was rejected and nothing else is in progress.',
        'A rejected plan isn’t counted as failure — it often means the proposal wasn’t realistic for you.',
      ],
    });
  }

  if (withWork.length === 0) {
    if (completed.length > 0) {
      const focus = completed[0];
      return finish('proud', {
        context: 'completed',
        focus,
        reasons: [`Every task in “${titleOf(focus)}” is completed.`],
      });
    }
    const waiting = list.find((p) => p.status === 'pending');
    if (waiting) {
      return finish('curious', {
        context: 'pending_review',
        focus: waiting,
        reasons: ['A plan is waiting for your review, and no tasks are being tracked yet.'],
      });
    }
    return finish('curious', {
      context: 'no_plans',
      reasons: ['There is no approved plan with tasks yet, so there isn’t enough activity to infer anything.'],
    });
  }

  // Focus on the newest approved plan that still has work left.
  const focus = withWork[0];
  const m = analyse(focus, nowMs);
  const notes = [];
  if (!m.hasCreated) {
    notes.push('This plan has no creation date, so time-based signals (workload vs. time left, inactivity) were skipped.');
  }
  if (m.done > 0 && !m.hasTimestamps) {
    notes.push('No completion times are available, so recent activity can’t be measured.');
  }

  // Tired: sustained quiet or repeated schedule changes — never just "tasks are pending".
  const stale = m.lastCompletion !== null && nowMs - m.lastCompletion >= THRESHOLDS.inactiveDays * DAY;
  const neverStarted = m.done === 0 && m.ageDays !== null && m.ageDays >= THRESHOLDS.inactiveDays;
  if (stale || neverStarted) {
    const reasons = stale
      ? [`The last completed task was ${plural(Math.floor((nowMs - m.lastCompletion) / DAY), 'day')} ago, with ${plural(m.pendingCount, 'task')} still open.`]
      : [`The plan was created ${plural(m.ageDays, 'day')} ago and no tasks are completed yet.`];
    return finish('tired', { context: 'inactive', focus, reasons, notes });
  }
  if (m.rescheduleCount >= THRESHOLDS.repeatedReschedules && m.overloaded) {
    return finish('tired', {
      context: 'repeated_changes',
      focus,
      reasons: [`The schedule has been revised ${plural(m.rescheduleCount, 'time')} and the remaining work still looks large.`],
      notes,
    });
  }

  // Overloaded: remaining workload well above the time left.
  if (m.overloaded) {
    return finish('overloaded', {
      context: 'workload',
      focus,
      reasons: [
        `About ${hoursText(m.remainingMinutes)} of tasks remain, but there is room for roughly ${hoursText(m.capacityMinutes)} (${plural(m.remainingDays, 'day')} left at ${focus.hoursPerDay} hrs/day, counted from when the plan was created).`,
      ],
      notes,
    });
  }

  // Milestone on a running plan.
  if (m.progress >= THRESHOLDS.milestonePercent && m.done >= THRESHOLDS.milestoneMinDone) {
    return finish('proud', {
      context: 'milestone',
      focus,
      reasons: [`“${titleOf(focus)}” is ${m.progress}% complete (${m.done} of ${m.total} tasks).`],
      notes,
      vars: { progress: m.progress },
    });
  }

  // Positive momentum needs real completion timestamps.
  if (m.recentCount >= THRESHOLDS.zoneCompletions) {
    return finish('in_the_zone', {
      context: 'streak',
      focus,
      reasons: [`${m.recentCount} tasks were completed in the last ${THRESHOLDS.recentWindowHours} hours.`],
      notes,
    });
  }
  if (m.recentCount >= 1) {
    return finish('happy', {
      context: 'recent',
      focus,
      reasons: [`${plural(m.recentCount, 'task')} completed in the last ${THRESHOLDS.recentWindowHours} hours, and the workload looks manageable.`],
      notes,
    });
  }

  if (m.done >= 1) {
    return finish('calm', {
      context: 'steady',
      focus,
      reasons: [`${m.done} of ${m.total} tasks are completed and the remaining workload looks manageable.`],
      notes,
      vars: { done: m.done, total: m.total },
    });
  }

  return finish('curious', {
    context: 'early',
    focus,
    reasons: ['The plan is approved but no tasks are completed yet — not enough activity to infer a pattern.'],
    notes,
  });
}
