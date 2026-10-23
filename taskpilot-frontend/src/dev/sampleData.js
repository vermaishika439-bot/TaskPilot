/**
 * DEV-ONLY preview data for design review.
 * Loaded exclusively through the "Preview sample data" toggle (import.meta.env.DEV).
 * It is never mixed with live data, never persisted, and the UI shows a banner while it is active.
 */

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString();

// `hoursAgo` fabricates a completion time for PREVIEW only, so MoodMate's recent-activity states can be reviewed.
const t = (id, title, durationMinutes, priority, completed = false, hoursAgo = null) => ({
  id,
  title,
  durationMinutes,
  priority,
  completed,
  ...(completed && hoursAgo !== null ? { completedAt: new Date(Date.now() - hoursAgo * 3_600_000).toISOString() } : {}),
});

export function buildSamplePlans() {
  const physics = {
    id: 'preview-physics',
    goal: 'Prepare for my physics exam',
    title: 'Physics Exam Preparation',
    summary: 'Cover mechanics, kinematics and dynamics, then finish with timed practice papers.',
    status: 'approved',
    availableDays: 6,
    hoursPerDay: 2,
    createdAt: daysAgo(2),
    days: [
      {
        id: 'preview-physics-d1',
        label: 'Day 1',
        title: 'Foundations',
        tasks: [t('pp-1', 'Read Chapter 1: Mechanics', 60, 'high', true, 40), t('pp-2', 'Solve practice problems', 60, 'high', true, 30)],
      },
      {
        id: 'preview-physics-d2',
        label: 'Day 2',
        title: 'Kinematics',
        tasks: [t('pp-3', 'Watch video lecture', 60, 'high', true, 20), t('pp-4', 'Practice numerical problems', 60, 'high', true, 6)],
      },
      {
        id: 'preview-physics-d3',
        label: 'Day 3',
        title: 'Dynamics',
        tasks: [t('pp-5', 'Study concepts', 60, 'medium', true, 1.5), t('pp-6', 'Solve previous year questions', 60, 'medium')],
      },
      {
        id: 'preview-physics-d4',
        label: 'Day 4',
        title: 'Energy & Work',
        tasks: [t('pp-7', 'Review key formulas', 45, 'medium'), t('pp-8', 'Take a short quiz', 30, 'low'), t('pp-9', 'Summarise notes', 45, 'low')],
      },
      {
        id: 'preview-physics-d5',
        label: 'Day 5',
        title: 'Waves & Optics',
        tasks: [t('pp-10', 'Read Chapter 6', 60, 'medium'), t('pp-11', 'Solve chapter exercises', 60, 'medium')],
      },
      {
        id: 'preview-physics-d6',
        label: 'Day 6',
        title: 'Mock exam',
        tasks: [t('pp-12', 'Timed practice paper', 120, 'high')],
      },
    ],
    proposal: {
      id: 'preview-proposal-1',
      generatedAt: new Date().toISOString(),
      changes: [
        'Reallocated remaining tasks across fewer days',
        'Added 1 extra hour per day',
        'Kept completed tasks unchanged',
      ],
      original: { remainingDays: 4, hoursPerDay: 2 },
      revised: { remainingDays: 3, hoursPerDay: 3 },
      tasksMoved: 4,
      newTasks: 0,
      totalTasks: 12,
      days: [
        {
          id: 'preview-prop-d1',
          label: 'Day 4',
          title: 'Practice & formulas',
          tasks: [
            t('pr-1', 'Solve previous year questions', 60, 'medium'),
            t('pr-2', 'Review key formulas', 45, 'medium'),
            t('pr-3', 'Take a short quiz', 30, 'low'),
          ],
        },
        {
          id: 'preview-prop-d2',
          label: 'Day 5',
          title: 'Waves & Optics',
          tasks: [
            t('pr-4', 'Summarise notes', 45, 'low'),
            t('pr-5', 'Read Chapter 6', 60, 'medium'),
            t('pr-6', 'Solve chapter exercises', 60, 'medium'),
          ],
        },
        {
          id: 'preview-prop-d3',
          label: 'Day 6',
          title: 'Mock exam',
          tasks: [t('pr-7', 'Timed practice paper', 120, 'high')],
        },
      ],
    },
  };

  const website = {
    id: 'preview-website',
    goal: 'Build a personal website',
    title: 'Build a Personal Website',
    summary: 'Design, build and deploy a simple portfolio site.',
    status: 'pending',
    availableDays: 7,
    hoursPerDay: 1.5,
    createdAt: daysAgo(1),
    days: [
      {
        id: 'preview-web-d1',
        label: 'Day 1',
        title: 'Plan & wireframe',
        tasks: [t('pw-1', 'List pages and content', 45, 'high'), t('pw-2', 'Sketch wireframes', 45, 'medium')],
      },
      {
        id: 'preview-web-d2',
        label: 'Day 2',
        title: 'Set up',
        tasks: [t('pw-3', 'Initialise project', 30, 'high'), t('pw-4', 'Build the layout', 60, 'high')],
      },
      {
        id: 'preview-web-d3',
        label: 'Day 3',
        title: 'Content & polish',
        tasks: [t('pw-5', 'Write the About section', 45, 'medium'), t('pw-6', 'Add project cards', 45, 'low')],
      },
    ],
    proposal: null,
  };

  const react = {
    id: 'preview-react',
    goal: 'Learn React',
    title: 'Learn React',
    summary: 'Fundamentals of components, state and hooks.',
    status: 'rejected',
    availableDays: 14,
    hoursPerDay: 1,
    createdAt: daysAgo(8),
    days: [
      {
        id: 'preview-react-d1',
        label: 'Day 1',
        title: 'JSX & components',
        tasks: [t('pr-a', 'Read the official intro', 30, 'medium'), t('pr-b', 'Build a static component', 30, 'medium')],
      },
    ],
    proposal: null,
  };

  const done = {
    id: 'preview-done',
    goal: 'Write a resume',
    title: 'Write a Resume',
    summary: 'Draft and polish a one-page resume.',
    status: 'approved',
    availableDays: 3,
    hoursPerDay: 1,
    createdAt: daysAgo(12),
    days: [
      {
        id: 'preview-done-d1',
        label: 'Day 1',
        title: 'Draft',
        tasks: [t('pd-1', 'Collect achievements', 30, 'medium', true), t('pd-2', 'Write first draft', 30, 'high', true)],
      },
      {
        id: 'preview-done-d2',
        label: 'Day 2',
        title: 'Polish',
        tasks: [t('pd-3', 'Edit and format', 45, 'medium', true)],
      },
    ],
    proposal: null,
  };

  return [physics, website, react, done];
}
