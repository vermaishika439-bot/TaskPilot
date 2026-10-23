// Run with: npm test   (uses Node's built-in test runner, no extra dependencies)
import test from 'node:test';
import assert from 'node:assert/strict';
import { getCompanionState } from './getCompanionState.js';
import { COMPANION_STATE_KEYS } from './companionContent.js';

const NOW = Date.parse('2026-10-18T12:00:00Z');
const DAY = 86_400_000;
const ago = (days) => new Date(NOW - days * DAY).toISOString();

let n = 0;
const task = (over = {}) => ({ id: `t${n++}`, title: 'Task', durationMinutes: 60, priority: 'medium', completed: false, ...over });
const plan = (over = {}) => ({
  id: `p${n++}`,
  goal: 'Goal',
  title: 'Goal',
  status: 'approved',
  availableDays: 10,
  hoursPerDay: 2,
  createdAt: ago(1),
  days: [{ label: 'Day 1', tasks: [task(), task()] }],
  proposal: null,
  ...over,
});
const withTasks = (tasks, over = {}) => plan({ days: [{ label: 'Day 1', tasks }], ...over });
const state = (plans) => getCompanionState({ plans, now: NOW }).state;

test('every state has copy', () => {
  assert.equal(COMPANION_STATE_KEYS.length, 8);
});

test('curious: no plans', () => {
  const r = getCompanionState({ plans: [], now: NOW });
  assert.equal(r.state, 'curious');
  assert.equal(r.actions.length, 0, 'no duplicate Create Plan button in the companion');
});

test('curious: plan awaiting approval (no progress to read)', () => {
  const r = getCompanionState({ plans: [plan({ status: 'pending' })], now: NOW });
  assert.equal(r.state, 'curious');
  assert.match(r.detail, /waiting for your review/);
});

test('curious: approved but too early, nothing done', () => {
  assert.equal(state([plan({ createdAt: ago(0) })]), 'curious');
});

test('calm: some progress, no timestamps', () => {
  const r = getCompanionState({ plans: [withTasks([task({ completed: true }), task(), task()])], now: NOW });
  assert.equal(r.state, 'calm');
  assert.ok(r.notes.some((x) => /completion times/.test(x)), 'explains missing timestamps');
});

test('happy: recent completion, on pace', () => {
  const p = withTasks([task({ completed: true, completedAt: ago(0.5) }), task(), task()]);
  assert.equal(state([p]), 'happy');
});

test('in_the_zone: several recent completions', () => {
  const done = Array.from({ length: 5 }, (_, i) => task({ completed: true, completedAt: ago(0.2 * i + 0.1) }));
  assert.equal(state([withTasks([...done, task(), task()], { availableDays: 14 })]), 'in_the_zone');
});

test('proud: every task in the only plan is complete', () => {
  const p = withTasks([task({ completed: true }), task({ completed: true })]);
  assert.equal(state([p]), 'proud');
});

test('proud: milestone on a running plan', () => {
  const tasks = [...Array.from({ length: 8 }, () => task({ completed: true })), task(), task()];
  assert.equal(state([withTasks(tasks, { availableDays: 30 })]), 'proud');
});

test('overloaded: remaining work exceeds time left', () => {
  // 10 pending hours, 2 days left at 2h/day = 4h capacity
  const tasks = Array.from({ length: 10 }, () => task());
  const p = withTasks(tasks, { availableDays: 5, createdAt: ago(3) });
  assert.equal(state([p]), 'overloaded');
});

test('overloaded: planned days have run out with work remaining', () => {
  const p = withTasks([task({ completed: true }), task(), task()], { availableDays: 3, createdAt: ago(5) });
  assert.equal(state([p]), 'overloaded');
});

test('NOT overloaded when work fits the time left', () => {
  const p = withTasks([task({ completed: true }), task(), task()], { availableDays: 10, createdAt: ago(1) });
  assert.notEqual(state([p]), 'overloaded');
});

test('tired: a week old with nothing completed', () => {
  const p = withTasks([task(), task()], { availableDays: 60, createdAt: ago(8) });
  assert.equal(state([p]), 'tired');
});

test('tired: repeated recorded schedule changes while still behind', () => {
  const tasks = Array.from({ length: 10 }, () => task());
  const p = withTasks(tasks, { availableDays: 5, createdAt: ago(3), rescheduleCount: 2 });
  assert.equal(state([p]), 'tired');
});

test('tired: no completion timestamps for 7+ days', () => {
  const p = withTasks([task({ completed: true, completedAt: ago(9) }), task(), task()], { availableDays: 60, createdAt: ago(10) });
  assert.equal(state([p]), 'tired');
});

test('NOT tired merely because tasks are pending', () => {
  const p = withTasks([task({ completed: true }), task(), task(), task()], { availableDays: 60, createdAt: ago(2) });
  assert.notEqual(state([p]), 'tired');
});

test('reset: only a rejected plan — not treated as failure', () => {
  const r = getCompanionState({ plans: [plan({ status: 'rejected' })], now: NOW });
  assert.equal(r.state, 'reset');
  assert.ok(r.reasons.join(' ').includes('isn’t counted as failure'));
});

test('a rejected plan is ignored when another plan is in progress', () => {
  const rejected = plan({ status: 'rejected', createdAt: ago(5) });
  const active = withTasks([task({ completed: true }), task(), task()]);
  assert.equal(state([rejected, active]), 'calm');
});

test('reset: newest plan rejected after an earlier plan was completed', () => {
  const completed = withTasks([task({ completed: true })], { createdAt: ago(10) });
  const rejected = plan({ status: 'rejected', createdAt: ago(1) });
  assert.equal(state([completed, rejected]), 'reset');
});

test('does not invent data: missing createdAt skips time-based signals and says so', () => {
  const p = withTasks([task({ completed: true }), task(), task()], { createdAt: undefined });
  const r = getCompanionState({ plans: [p], now: NOW });
  assert.notEqual(r.state, 'overloaded');
  assert.notEqual(r.state, 'tired');
  assert.ok(r.notes.some((x) => /no creation date/.test(x)));
});

test('a waiting proposal is always offered as an action', () => {
  const p = withTasks([task({ completed: true }), task(), task()], { proposal: { id: 'x' } });
  const r = getCompanionState({ plans: [p], now: NOW });
  assert.ok(r.actions.some((a) => a.id === 'proposal' && a.to === `/plans/${p.id}/reschedule`));
  assert.ok(r.actions.length <= 2);
});

test('is pure: same input, same output, input untouched', () => {
  const plans = [withTasks([task({ completed: true }), task()])];
  const snapshot = JSON.stringify(plans);
  assert.deepEqual(getCompanionState({ plans, now: NOW }), getCompanionState({ plans, now: NOW }));
  assert.equal(JSON.stringify(plans), snapshot);
});

test('MoodMate never offers a "create plan" action', () => {
  const scenarios = [
    [],
    [plan({ status: 'pending' })],
    [plan({ status: 'rejected' })],
    [withTasks([task({ completed: true }), task({ completed: true })])],
    [withTasks([task({ completed: true }), task()])],
  ];
  for (const plans of scenarios) {
    const r = getCompanionState({ plans, now: NOW });
    assert.ok(!r.actions.some((a) => a.to === '/create'), `state ${r.state}`);
  }
});
