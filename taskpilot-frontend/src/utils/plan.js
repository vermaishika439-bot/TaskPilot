/** Pure helpers that derive display values from the frontend plan shape (see services/api.js). */

export function allTasks(plan) {
  return (plan?.days ?? []).flatMap((d) => d.tasks ?? []);
}

export function taskCounts(plan) {
  const tasks = allTasks(plan);
  const done = tasks.filter((t) => t.completed).length;
  return { total: tasks.length, done, pending: tasks.length - done };
}

export function progressOf(plan) {
  const { total, done } = taskCounts(plan);
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

/** Maps raw status + progress to the label users see. */
export function displayStatus(plan) {
  if (plan.status === 'pending') return { key: 'pending', label: 'Pending approval' };
  if (plan.status === 'rejected') return { key: 'rejected', label: 'Rejected' };
  const pct = progressOf(plan);
  if (pct >= 100) return { key: 'completed', label: 'Completed' };
  if (pct > 0) return { key: 'active', label: 'Active' };
  return { key: 'approved', label: 'Approved' };
}

export function planTitle(plan) {
  return plan.title || plan.goal;
}

export function planPath(plan) {
  return plan.status === 'pending' ? `/plans/${plan.id}/review` : `/plans/${plan.id}`;
}

export function dayMinutes(day) {
  return (day.tasks ?? []).reduce((sum, t) => sum + (Number(t.durationMinutes) || 0), 0);
}

export function formatDuration(minutes) {
  if (!minutes) return '—';
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  const text = Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace(/\.0$/, '');
  return `${text} ${hours === 1 ? 'hr' : 'hrs'}`;
}

export function formatHours(hours) {
  if (hours == null) return '—';
  return `${hours} ${hours === 1 ? 'hr' : 'hrs'}`;
}

export function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return 'Good evening';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
