import { CircleCheck, Info, OctagonAlert, X } from 'lucide-react';
import { useApp } from '../state/AppState.jsx';

const ICONS = { success: CircleCheck, error: OctagonAlert, info: Info };

export function Toast({ toast, onDismiss }) {
  const Icon = ICONS[toast.type] ?? Info;
  return (
    <div className={`toast toast-${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>
      <Icon size={18} aria-hidden="true" />
      <span className="toast-text">{toast.message}</span>
      <button type="button" className="toast-close" aria-label="Dismiss notification" onClick={() => onDismiss(toast.id)}>
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

export default function ToastRegion() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="toast-region" aria-live="polite">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={dismissToast} />
      ))}
    </div>
  );
}
