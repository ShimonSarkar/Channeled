import { Moon, Plus, Sun, Waves } from 'lucide-react';
import { useUI } from '../state/ui';
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
    </header>
  );
}
