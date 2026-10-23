import { NavLink } from 'react-router-dom';
import { Activity, Bot, LayoutGrid, ListChecks, UserRound } from 'lucide-react';
import Logo from './Logo.jsx';
import CompanionCard from '../companion/CompanionCard.jsx';
import { useApp } from '../state/AppState.jsx';
import { useProfile } from '../state/Profile.jsx';
import { initials } from '../utils/profile.js';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/assistant', label: 'AI Assistant', icon: Bot },
  { to: '/plans', label: 'My Plans', icon: ListChecks },
  { to: '/activity', label: 'Activity', icon: Activity },
];

export default function Sidebar({ open, onClose }) {
  const { plans, load } = useApp();
  const { profile } = useProfile();

  // MoodMate reads "no plans" as a fresh start, so don't show it while plans are loading or failed to load.
  const plansReady = !['loading', 'idle', 'error'].includes(load.status) || plans.length > 0;

  return (
    <>
      {open && <button type="button" className="nav-backdrop" aria-label="Close navigation" onClick={onClose} />}
      <aside className={`sidebar${open ? ' open' : ''}`} id="app-sidebar" aria-label="Primary">
        <div className="brand">
          <Logo />
          <span className="brand-name">TaskPilot</span>
        </div>

        <nav className="nav" aria-label="Main navigation">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="nav-link">
              <Icon size={18} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>

        {plansReady && <CompanionCard plans={plans} />}

        <div className="sidebar-spacer" />

        <NavLink to="/profile" className="user-chip" aria-label={profile ? `Profile: ${profile.name}` : 'Set up your profile'}>
          <span className="avatar" aria-hidden="true">
            {profile ? initials(profile.name) : <UserRound size={17} />}
          </span>
          <span className="user-text">
            <strong>{profile ? profile.name : 'Set up profile'}</strong>
            <small>{profile ? profile.email || profile.role || 'Edit profile & theme' : 'Add your name'}</small>
          </span>
        </NavLink>
      </aside>
    </>
  );
}
