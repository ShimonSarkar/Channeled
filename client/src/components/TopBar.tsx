import { useEffect, useRef, useState } from 'react';
import { LogOut, Moon, Plus, Sun, Waves } from 'lucide-react';
import { useUI } from '../state/ui';
import { useAuth, useLogout } from '../state/queries';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

export function TopBar() {
  const { theme, toggleTheme, setQuickAdd } = useUI();
  return (
    <header className="topbar">
      <div className="brand">
        <Waves size={18} className="brand-icon" aria-hidden />
        <h1>Channeled</h1>
      </div>
      <WorkspaceSwitcher />
      <div className="spacer" />
      <span className="topbar-hint" style={{ fontSize: 12, color: 'var(--text-faint)' }}>
        Press <span className="kbd">N</span> to add
      </span>
      <button className="btn btn-primary topbar-add" onClick={() => setQuickAdd(true)}>
        <Plus size={14} /> <span className="topbar-add-label">New task</span>
      </button>
      <button className="icon-btn" aria-label="Toggle theme" onClick={toggleTheme}>
        {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
      </button>
      <UserMenu />
    </header>
  );
}

function UserMenu() {
  const { data: user } = useAuth();
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Click-outside / Escape to close the dropdown.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;
  const initial = (user.name || user.email || '?').trim().charAt(0).toUpperCase();
  return (
    <div className="user-menu" ref={ref}>
      <button
        className="user-avatar"
        aria-label={`Account menu for ${user.name || user.email}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {user.picture ? (
          <img src={user.picture} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span aria-hidden>{initial}</span>
        )}
      </button>
      {open && (
        <div className="user-menu-pop" role="menu">
          <div className="user-menu-info">
            <div className="user-menu-name">{user.name || user.email}</div>
            {user.name && <div className="user-menu-email">{user.email}</div>}
          </div>
          <button
            className="user-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              logout.mutate(undefined, {
                // Hard reload so any cached state in memory is cleared too.
                onSettled: () => window.location.assign('/'),
              });
            }}
          >
            <LogOut size={14} /> <span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
}
