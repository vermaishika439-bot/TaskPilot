import { LoaderCircle } from 'lucide-react';

export default function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <LoaderCircle className="spin" size={22} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
