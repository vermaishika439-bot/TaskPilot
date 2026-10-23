import { CircleCheck, Info, TriangleAlert, OctagonAlert } from 'lucide-react';

const ICONS = { error: OctagonAlert, warn: TriangleAlert, info: Info, success: CircleCheck };

/**
 * Inline message block. tone: 'error' | 'warn' | 'info' | 'success'.
 * Errors are announced to screen readers immediately.
 */
export default function ErrorMessage({ tone = 'error', title, children, actions }) {
  const Icon = ICONS[tone] ?? Info;
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon size={18} aria-hidden="true" />
      <div className="notice-body">
        {title && <strong>{title}</strong>}
        {children && <p>{children}</p>}
        {actions && <div className="notice-actions">{actions}</div>}
      </div>
    </div>
  );
}
