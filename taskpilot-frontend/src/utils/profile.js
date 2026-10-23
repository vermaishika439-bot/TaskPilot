/** Pure helpers for the local (no-account) profile. */

export const NAME_MAX = 50;
export const ROLE_MAX = 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateProfile({ name = '', email = '', role = '' }) {
  const errors = {};
  const n = name.trim();
  if (!n) errors.name = 'Please enter your name.';
  else if (n.length > NAME_MAX) errors.name = `Keep your name under ${NAME_MAX} characters.`;
  const e = email.trim();
  if (e && !EMAIL_RE.test(e)) errors.email = 'Enter a valid email address, or leave it blank.';
  if (role.trim().length > ROLE_MAX) errors.role = `Keep this under ${ROLE_MAX} characters.`;
  return errors;
}

export function cleanProfile({ name = '', email = '', role = '' }) {
  return { name: name.trim().replace(/\s+/g, ' '), email: email.trim(), role: role.trim() };
}

export function firstName(name) {
  return (name || '').trim().split(/\s+/)[0] || '';
}

export function initials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0];
  return letters.toUpperCase();
}
