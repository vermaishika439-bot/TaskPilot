/**
 * Local message templates for MoodMate. No AI/API involved.
 * States are inferred productivity patterns — never claims about real emotions or health.
 */

export const COMPANION_STATES = {
  curious: { label: 'Curious', message: 'Let’s make a plan that works for you.' },
  calm: { label: 'Calm', message: 'One step at a time. You’re making progress.' },
  happy: { label: 'Happy', message: 'Nice work! You moved a few things forward.' },
  in_the_zone: { label: 'In the zone', message: 'You’re building momentum. Keep a sustainable pace.' },
  proud: { label: 'Proud', message: 'You did it! Take a moment to appreciate the progress.' },
  overloaded: { label: 'Overloaded', message: 'There’s quite a bit left. Want to review your schedule?' },
  tired: { label: 'Tired', message: 'It’s okay to slow down. Let’s look at what still needs attention.' },
  reset: { label: 'Reset', message: 'Plans can change. Let’s find a better way forward.' },
};

export const COMPANION_STATE_KEYS = Object.keys(COMPANION_STATES);

/** Short context line under the main message. `context` is chosen by getCompanionState. */
const DETAILS = {
  'curious:no_plans': 'Describe a goal and I’ll help shape it into a plan.',
  'curious:pending_review': '“{title}” is waiting for your review.',
  'curious:early': 'Complete a task or two and I’ll have more to go on.',
  'calm:steady': '{done} of {total} tasks done on “{title}”.',
  'happy:recent': 'Tasks were completed recently on “{title}”.',
  'in_the_zone:streak': 'Several tasks were completed in the last few days.',
  'proud:completed': 'Every task in “{title}” is done.',
  'proud:milestone': '“{title}” is {progress}% complete.',
  'overloaded:workload': 'The remaining work looks large for the time left on “{title}”.',
  'tired:repeated_changes': '“{title}” has needed several schedule changes.',
  'tired:inactive': 'Nothing has been completed on “{title}” for a while.',
  'reset:rejected': 'A rejected plan isn’t a setback — it may just not have fit.',
};

export function buildDetail(state, context, vars = {}) {
  const template = DETAILS[`${state}:${context}`] ?? '';
  return template.replace(/\{(\w+)\}/g, (_, key) => (vars[key] ?? '').toString());
}

export const COMPANION_DISCLAIMER =
  'MoodMate infers patterns from your plan and task data. It can’t know how you actually feel, and nothing it infers is saved.';
