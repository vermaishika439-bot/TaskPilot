import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../state/Theme.jsx';

/** Quick light/dark switch for the top bar. The full Light / Dark / System choice is on the Profile page. */
export default function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  const next = resolved === 'light' ? 'dark' : 'light';
  return (
    <button
      type="button"
      className="icon-btn"
      onClick={toggle}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      {resolved === 'light' ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}
    </button>
  );
}
