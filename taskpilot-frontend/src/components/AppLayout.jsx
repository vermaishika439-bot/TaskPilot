import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Bot, Menu } from 'lucide-react';
import Sidebar from './Sidebar.jsx';
import ConnectionIndicator from './ConnectionIndicator.jsx';
import ToastRegion from './Toast.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import WelcomeDialog from './WelcomeDialog.jsx';

export default function AppLayout() {
  const [navOpen, setNavOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    setNavOpen(false);
    window.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setNavOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />

      <div className="app-main">
        <header className="topbar">
          <button
            type="button"
            className="icon-btn menu-btn"
            aria-label="Open navigation"
            aria-expanded={navOpen}
            aria-controls="app-sidebar"
            onClick={() => setNavOpen(true)}
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          <div className="topbar-spacer" />
          <ConnectionIndicator />
          <ThemeToggle />
          {!['/assistant', '/plans'].includes(pathname) && (
            <Link to="/assistant?mode=create" className="btn btn-primary btn-sm">
              <Bot size={16} aria-hidden="true" /> Plan with AI
            </Link>
          )}
        </header>


        <main id="main" className="content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>

      <ToastRegion />
      <WelcomeDialog />
    </div>
  );
}
