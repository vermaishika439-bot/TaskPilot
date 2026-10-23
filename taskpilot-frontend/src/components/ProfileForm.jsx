import { useId, useState } from 'react';
import { CircleAlert, Mail, Briefcase, User } from 'lucide-react';
import { NAME_MAX, ROLE_MAX, validateProfile } from '../utils/profile.js';

/** Name (required), email and role (optional). Calls onSubmit(values) only when valid. */
export default function ProfileForm({ initial, submitLabel = 'Save', onSubmit, children }) {
  const uid = useId();
  const [values, setValues] = useState({ name: initial?.name ?? '', email: initial?.email ?? '', role: initial?.role ?? '' });
  const [errors, setErrors] = useState({});
  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }));
  const ids = { name: `${uid}-name`, email: `${uid}-email`, role: `${uid}-role` };

  function submit(e) {
    e.preventDefault();
    const found = validateProfile(values);
    setErrors(found);
    const first = ['name', 'email', 'role'].find((k) => found[k]);
    if (first) {
      document.getElementById(ids[first])?.focus();
      return;
    }
    onSubmit(values);
  }

  const Field = ({ k, label, hint, icon: Icon, ...input }) => (
    <div className="field">
      <label className="field-label" htmlFor={ids[k]}>
        {label}
      </label>
      <div className="input-wrap">
        <Icon size={17} aria-hidden="true" />
        <input
          id={ids[k]}
          className="input"
          value={values[k]}
          onChange={set(k)}
          aria-invalid={Boolean(errors[k])}
          aria-describedby={`${ids[k]}-hint${errors[k] ? ` ${ids[k]}-err` : ''}`}
          {...input}
        />
      </div>
      <span id={`${ids[k]}-hint`} className="field-hint">
        {hint}
      </span>
      {errors[k] && (
        <p id={`${ids[k]}-err`} className="field-error" role="alert">
          <CircleAlert size={14} aria-hidden="true" /> {errors[k]}
        </p>
      )}
    </div>
  );

  return (
    <form onSubmit={submit} noValidate className="profile-form">
      {Field({ k: 'name', label: 'Your name', hint: 'Shown in your greeting.', icon: User, placeholder: 'e.g. Alex', autoComplete: 'given-name', maxLength: NAME_MAX + 20 })}
      {Field({ k: 'email', label: 'Email (optional)', hint: 'Only displayed here on this device. TaskPilot doesn’t send emails.', icon: Mail, type: 'email', placeholder: 'you@example.com', autoComplete: 'email' })}
      {Field({ k: 'role', label: 'What do you do? (optional)', hint: 'For example: student, designer, engineer.', icon: Briefcase, placeholder: 'e.g. Student', maxLength: ROLE_MAX + 20 })}
      <div className="profile-actions">
        {children}
        <button type="submit" className="btn btn-primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
