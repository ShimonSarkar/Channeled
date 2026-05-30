import { Moon, Plus, Sun } from 'lucide-react';
import { useUI } from '../state/ui';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

export function TopBar() {
  const { theme, toggleTheme, setQuickAdd } = useUI();
  return (
    <header className="topbar">
      <h1>Channeled</h1>
      <WorkspaceSwitcher />
      <div className="spacer" />
      <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
        Press <span className="kbd">N</span> to add
      </span>
      <button className="btn btn-primary" onClick={() => setQuickAdd(true)}>
        <Plus size={14} /> New task
      </button>
      <button className="icon-btn" aria-label="Toggle theme" onClick={toggleTheme}>
        {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
      </button>
    </header>
  );
}
