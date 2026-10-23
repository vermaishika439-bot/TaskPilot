import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const KEY = 'taskpilot.theme'; // 'dark' | 'light' | 'system'
const ThemeContext = createContext(null);

const systemPrefersLight = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches;

function readPreference() {
  try {
    const value = localStorage.getItem(KEY);
    return ['dark', 'light', 'system'].includes(value) ? value : 'dark';
  } catch {
    return 'dark';
  }
}

export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState(readPreference);
  const [systemLight, setSystemLight] = useState(systemPrefersLight);

  // Follow OS changes while "system" is selected.
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: light)');
    if (!query) return undefined;
    const onChange = (e) => setSystemLight(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const resolved = preference === 'system' ? (systemLight ? 'light' : 'dark') : preference;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'light' ? '#f5f2fc' : '#171323');
  }, [resolved]);

  const setPreference = useCallback((next) => {
    setPreferenceState(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage unavailable: applies for this visit only */
    }
  }, []);

  const toggle = useCallback(() => setPreference(resolved === 'light' ? 'dark' : 'light'), [resolved, setPreference]);

  const value = useMemo(() => ({ preference, resolved, setPreference, toggle }), [preference, resolved, setPreference, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
