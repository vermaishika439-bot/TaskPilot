import { useEffect, useRef } from 'react';
import { ShieldCheck } from 'lucide-react';
import ProfileForm from './ProfileForm.jsx';
import Logo from './Logo.jsx';
import { useProfile } from '../state/Profile.jsx';

/** First-open prompt asking what to call the user. Skippable, and shown only once. */
export default function WelcomeDialog() {
  const { welcomeNeeded, saveProfile, skipWelcome } = useProfile();
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (welcomeNeeded && !dialog.open) dialog.showModal();
    if (!welcomeNeeded && dialog.open) dialog.close();
  }, [welcomeNeeded]);

  return (
    <dialog ref={ref} className="dialog welcome" aria-labelledby="welcome-title" onCancel={skipWelcome}>
      <div className="dialog-body">
        <Logo size={36} />
        <h2 id="welcome-title">Welcome to TaskPilot</h2>
        <p>What should we call you? We’ll use it to greet you on your dashboard.</p>
        <ProfileForm submitLabel="Save and continue" onSubmit={saveProfile}>
          <button type="button" className="btn btn-ghost" onClick={skipWelcome}>
            Skip for now
          </button>
        </ProfileForm>
        <p className="side-note">
          <ShieldCheck size={16} aria-hidden="true" />
          <span>Saved only in this browser. No account is created and nothing is sent anywhere.</span>
        </p>
      </div>
    </dialog>
  );
}
