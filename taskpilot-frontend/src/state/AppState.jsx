import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../services/api.js';

const AppContext = createContext(null);

export const PREVIEW_READONLY_MESSAGE =
  'Preview sample data is read-only. Turn off the preview to work with real data.';

let idCounter = 0;
const nextId = () => `${Date.now()}-${idCounter++}`;

export function AppProvider({ children }) {
  const [livePlans, setLivePlans] = useState([]);
  const [previewPlans, setPreviewPlans] = useState(null); // DEV only; null = off
  const [load, setLoad] = useState({
    status: api.isBackendConfigured ? 'idle' : 'unconfigured', // unconfigured | idle | loading | ready | error
    error: null,
  });
  const [health, setHealth] = useState({ status: api.isBackendConfigured ? 'checking' : 'unconfigured' });
  const [reminders, setReminders] = useState({ status: api.isBackendConfigured ? 'idle' : 'unconfigured', events: [] }); // idle | ready | error | unconfigured
  const [activity, setActivity] = useState([]);
  const [activityStatus, setActivityStatus] = useState(api.isBackendConfigured ? 'idle' : 'unconfigured');
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const plans = previewPlans ?? livePlans;
  const isPreview = previewPlans !== null;

  /* ── toasts ── */
  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (message, type = 'info') => {
      const id = nextId();
      setToasts((prev) => [...prev.slice(-3), { id, message, type }]);
      timers.current.set(
        id,
        setTimeout(() => dismissToast(id), type === 'error' ? 7000 : 4500),
      );
    },
    [dismissToast],
  );

  /* ── activity log (session only, never persisted) ── */
  const logActivity = useCallback((type, text) => {
    setActivity((prev) => [{ id: nextId(), type, text, at: new Date().toISOString() }, ...prev].slice(0, 100));
  }, []);

  /* ── backend health ── */
  const recheckHealth = useCallback(async () => {
    if (!api.isBackendConfigured) {
      setHealth({ status: 'unconfigured' });
      return;
    }
    setHealth({ status: 'checking' });
    setHealth(await api.checkHealth());
  }, []);

  useEffect(() => {
    recheckHealth();
  }, [recheckHealth]);

  /* ── plan loading ── */
  const upsertPlan = useCallback((plan) => {
    setLivePlans((prev) => (prev.some((p) => p.id === plan.id) ? prev.map((p) => (p.id === plan.id ? plan : p)) : [plan, ...prev]));
  }, []);

  const refreshPlans = useCallback(async () => {
    if (!api.isBackendConfigured) {
      setLoad({ status: 'unconfigured', error: null });
      return;
    }
    setLoad({ status: 'loading', error: null });
    try {
      const result = await api.listPlans();
      setLivePlans(Array.isArray(result) ? result : []);
      setLoad({ status: 'ready', error: null });
    } catch (err) {
      setLoad({ status: 'error', error: err.message || 'Could not load plans.' });
    }
  }, []);

  useEffect(() => {
    refreshPlans();
  }, [refreshPlans]);

  const refreshActivity = useCallback(async () => {
    if (!api.isBackendConfigured) return;
    setActivityStatus('loading');
    try {
      setActivity(await api.getActivity());
      setActivityStatus('ready');
    } catch {
      setActivityStatus('error');
    }
  }, []);

  useEffect(() => { refreshActivity(); }, [refreshActivity]);

  /* ── upcoming reminders (the only schedule data the backend provides) ── */
  const refreshReminders = useCallback(async () => {
    if (!api.isBackendConfigured) {
      setReminders({ status: 'unconfigured', events: [] });
      return;
    }
    try {
      setReminders({ status: 'ready', events: await api.getUpcomingSchedule() });
    } catch {
      setReminders({ status: 'error', events: [] });
    }
  }, []);

  useEffect(() => {
    refreshReminders();
  }, [refreshReminders]);

  /* ── dev preview ── */
  const enablePreview = useCallback(async () => {
    if (!import.meta.env.DEV) return;
    const { buildSamplePlans } = await import('../dev/sampleData.js');
    setPreviewPlans(buildSamplePlans());
  }, []);
  const disablePreview = useCallback(() => setPreviewPlans(null), []);

  /* ── actions ──
     Every action returns { ok: true, ... } only after the API confirms success.
     Local state is updated from the API response — never optimistically. */
  const attempt = useCallback(
    async (label, fn) => {
      if (isPreview) {
        logActivity('error', `${label} blocked: preview data is read-only.`);
        return { ok: false, error: PREVIEW_READONLY_MESSAGE };
      }
      try {
        const value = await fn();
        logActivity('success', label);
        refreshActivity();
        return { ok: true, value };
      } catch (err) {
        const error = err?.message || 'Something went wrong.';
        logActivity('error', `${label} failed: ${error}`);
        return { ok: false, error, code: err?.code };
      }
    },
    [isPreview, logActivity, refreshActivity],
  );

  const refreshPlan = useCallback(
    async (planId) => {
      const fresh = await api.getPlan(planId);
      upsertPlan(fresh);
      return fresh;
    },
    [upsertPlan],
  );

  const actions = useMemo(
    () => ({
      createPlan: (payload) =>
        attempt('Plan generated', async () => {
          const plan = await api.createPlan(payload);
          upsertPlan(plan);
          return plan;
        }),
      approvePlan: (planId) =>
        attempt('Plan approved', async () => {
          await api.approvePlan(planId);
          return refreshPlan(planId);
        }),
      rejectPlan: (planId) =>
        attempt('Plan rejected', async () => {
          await api.rejectPlan(planId);
          return refreshPlan(planId);
        }),
      deletePlan: (planId) =>
        attempt('Plan deleted', async () => {
          await api.deletePlan(planId);
          await refreshPlans();
          return planId;
        }),
      setTaskStatus: (planId, taskId, completed) =>
        attempt(completed ? 'Task marked completed' : 'Task marked pending', async () => {
          await api.updateTaskStatus(planId, taskId, completed);
          return refreshPlan(planId);
        }),
      setTaskSchedule: (planId, taskId, schedule) =>
        attempt('Task schedule updated', async () => {
          await api.updateTaskSchedule(planId, taskId, schedule);
          return refreshPlan(planId);
        }),
      requestReschedule: (planId, availability) =>
        attempt('Revised schedule proposed', async () => {
          await api.requestReschedule(planId, availability);
          return refreshPlan(planId);
        }),
      acceptProposal: (planId, proposalId) =>
        attempt('Proposed schedule applied', async () => {
          await api.acceptReschedule(planId, proposalId);
          return refreshPlan(planId);
        }),
      rejectProposal: (planId, proposalId) =>
        attempt('Proposal rejected — schedule unchanged', async () => {
          await api.rejectReschedule(planId, proposalId);
          return refreshPlan(planId);
        }),
    }),
    [attempt, upsertPlan, refreshPlan],
  );

  const value = useMemo(
    () => ({
      plans,
      isPreview,
      load,
      health,
      reminders,
      refreshReminders,
      activity,
      activityStatus,
      refreshActivity,
      toasts,
      toast,
      dismissToast,
      recheckHealth,
      refreshPlans,
      enablePreview,
      disablePreview,
      actions,
      backendConfigured: api.isBackendConfigured,
    }),
    [plans, isPreview, load, health, reminders, refreshReminders, activity, toasts, toast, dismissToast, recheckHealth, refreshPlans, enablePreview, disablePreview, actions],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

export function usePlan(planId) {
  const { plans } = useApp();
  return plans.find((p) => String(p.id) === String(planId)) ?? null;
}
