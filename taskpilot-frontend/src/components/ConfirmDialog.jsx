import { useEffect, useRef } from 'react';
import { LoaderCircle } from 'lucide-react';
import ErrorMessage from './ErrorMessage.jsx';

/**
 * Accessible confirmation modal built on the native <dialog> element
 * (focus trapping, Escape to close and inert background come for free).
 * Stays open on error so the message can be read and the action retried.
 */
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary', // 'primary' | 'danger'
  busy = false,
  error = null,
  onConfirm,
  onCancel,
}) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div className="dialog-body">
        <h2 id="confirm-title">{title}</h2>
        <p>{children}</p>
        {error && <ErrorMessage title="That didn't go through">{error}</ErrorMessage>}
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy && <LoaderCircle size={16} className="spin" aria-hidden="true" />}
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
