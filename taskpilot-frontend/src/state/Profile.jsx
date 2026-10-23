import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { cleanProfile, firstName } from '../utils/profile.js';

/**
 * A local, optional profile used only for greetings. There is NO authentication or account:
 * the details live in this browser's localStorage and are never sent anywhere.
 */
const PROFILE_KEY = 'taskpilot.profile';
const SKIP_KEY = 'taskpilot.profile.skipped';
const ProfileContext = createContext(null);

function readProfile() {
  try {
    const raw = JSON.parse(localStorage.getItem(PROFILE_KEY));
    if (raw && typeof raw.name === 'string' && raw.name.trim()) {
      return cleanProfile({ name: raw.name, email: String(raw.email ?? ''), role: String(raw.role ?? '') });
    }
  } catch {
    /* ignore corrupt or unavailable storage */
  }
  return null;
}
function readSkipped() {
  try {
    return localStorage.getItem(SKIP_KEY) === '1';
  } catch {
    return false;
  }
}
function write(fn) {
  try {
    fn();
  } catch {
    /* storage unavailable: kept in memory for this visit */
  }
}

export function ProfileProvider({ children }) {
  const [profile, setProfile] = useState(readProfile);
  const [skipped, setSkipped] = useState(readSkipped);

  const saveProfile = useCallback((values) => {
    const next = cleanProfile(values);
    setProfile(next);
    write(() => localStorage.setItem(PROFILE_KEY, JSON.stringify(next)));
  }, []);

  const clearProfile = useCallback(() => {
    setProfile(null);
    setSkipped(true); // clearing is deliberate, so don't show the welcome prompt again
    write(() => {
      localStorage.removeItem(PROFILE_KEY);
      localStorage.setItem(SKIP_KEY, '1');
    });
  }, []);

  const skipWelcome = useCallback(() => {
    setSkipped(true);
    write(() => localStorage.setItem(SKIP_KEY, '1'));
  }, []);

  const value = useMemo(
    () => ({
      profile,
      firstName: profile ? firstName(profile.name) : '',
      welcomeNeeded: !profile && !skipped,
      saveProfile,
      clearProfile,
      skipWelcome,
    }),
    [profile, skipped, saveProfile, clearProfile, skipWelcome],
  );
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used inside <ProfileProvider>');
  return ctx;
}
