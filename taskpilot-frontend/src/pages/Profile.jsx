import { useState } from 'react';
import { Monitor, Moon, ShieldCheck, Sun, Trash2 } from 'lucide-react';
import Header from '../components/Header.jsx';
import ProfileForm from '../components/ProfileForm.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { useProfile } from '../state/Profile.jsx';
import { useTheme } from '../state/Theme.jsx';
import { useApp } from '../state/AppState.jsx';

const THEMES = [
  { key: 'light', label: 'Light', icon: Sun },
  { key: 'dark', label: 'Dark', icon: Moon },
  { key: 'system', label: 'System', icon: Monitor },
];

export default function Profile() {
  const { profile, saveProfile, clearProfile } = useProfile();
  const { preference, setPreference } = useTheme();
  const { toast } = useApp();
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div className="page">
      <Header title="Profile" subtitle="Personalise your greeting and choose how TaskPilot looks." />

      <div className="profile-grid">
        <section className="card" aria-labelledby="details-title">
          <h2 className="card-title" id="details-title" style={{ marginBottom: 16 }}>
            Your details
          </h2>
          <ProfileForm
            // Re-mount when the saved profile changes (e.g. after clearing) so fields reset.
            key={profile ? 'saved' : 'empty'}
            initial={profile}
            submitLabel={profile ? 'Save changes' : 'Save details'}
            onSubmit={(values) => {
              saveProfile(values);
              toast('Profile saved.', 'success');
            }}
          />
          <p className="side-note" style={{ marginTop: 18 }}>
            <ShieldCheck size={16} aria-hidden="true" />
            <span>Stored only in this browser. There’s no account or sign-in, and nothing is sent to a server.</span>
          </p>
        </section>

        <div className="stack">
          <section className="card" aria-labelledby="appearance-title">
            <h2 className="card-title" id="appearance-title" style={{ marginBottom: 6 }}>
              Appearance
            </h2>
            <p className="field-hint" style={{ marginBottom: 14 }}>
              “System” follows your device’s light or dark setting.
            </p>
            <div className="segmented" role="radiogroup" aria-label="Theme">
              {THEMES.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={preference === key}
                  className="segment"
                  onClick={() => setPreference(key)}
                >
                  <Icon size={16} aria-hidden="true" /> {label}
                </button>
              ))}
            </div>
          </section>

          {profile && (
            <section className="card" aria-labelledby="data-title">
              <h2 className="card-title" id="data-title" style={{ marginBottom: 6 }}>
                Data on this device
              </h2>
              <p className="field-hint" style={{ marginBottom: 14 }}>
                Remove your saved name, email and role from this browser.
              </p>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmClear(true)}>
                <Trash2 size={15} aria-hidden="true" /> Clear my details
              </button>
            </section>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Clear your details?"
        confirmLabel="Clear details"
        tone="danger"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          clearProfile();
          setConfirmClear(false);
          toast('Your details were removed from this browser.', 'success');
        }}
      >
        Your greeting will go back to a plain “Good morning”. Your plans aren’t affected.
      </ConfirmDialog>
    </div>
  );
}
