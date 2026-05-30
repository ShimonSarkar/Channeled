import { useMemo, useState } from 'react';
import { Check, ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  useAppState,
  useCreateWorkspace,
  useDeleteWorkspace,
  useUpdateWorkspace,
} from '../state/queries';
import { useUI } from '../state/ui';
import { useToasts } from './Toast';

export function WorkspaceSwitcher() {
  const { data } = useAppState();
  const setCurrent = useUI((s) => s.setCurrentWorkspaceId);
  const pushToast = useToasts((s) => s.push);
  const createWs = useCreateWorkspace();
  const renameWs = useUpdateWorkspace();
  const deleteWs = useDeleteWorkspace();

  const [open, setOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const workspaces = useMemo(
    () => (data?.workspaces ?? []).slice().sort((a, b) => a.position - b.position),
    [data?.workspaces]
  );
  const currentId = data?.currentWorkspaceId ?? null;
  const current = workspaces.find((w) => w.id === currentId) ?? workspaces[0];

  if (!current) return null;

  const handleCreate = () => {
    const v = newName.trim();
    if (!v) return;
    createWs.mutate(
      { name: v },
      {
        onSuccess: (created) => {
          setNewName('');
          setCreating(false);
          setOpen(false);
          setCurrent(created.id);
          pushToast(`Created workspace ${created.name}`);
        },
        onError: (e) => pushToast(`Create failed: ${(e as Error).message}`, 'error'),
      }
    );
  };

  const handleRename = (id: string) => {
    const v = renameValue.trim();
    if (!v) return;
    renameWs.mutate(
      { id, body: { name: v } },
      {
        onSuccess: () => {
          setRenamingId(null);
          pushToast('Renamed');
        },
        onError: (e) => pushToast(`Rename failed: ${(e as Error).message}`, 'error'),
      }
    );
  };

  const handleDelete = (id: string, name: string) => {
    if (workspaces.length <= 1) {
      pushToast('You need at least one workspace.', 'error');
      return;
    }
    const ok = window.confirm(
      `Delete workspace "${name}" and all its workstreams and tasks? This cannot be undone.`
    );
    if (!ok) return;
    deleteWs.mutate(id, {
      onSuccess: () => {
        if (currentId === id) {
          const fallback = workspaces.find((w) => w.id !== id);
          if (fallback) setCurrent(fallback.id);
        }
        pushToast(`Deleted workspace ${name}`);
      },
      onError: (e) => pushToast(`Delete failed: ${(e as Error).message}`, 'error'),
    });
  };

  return (
    <div className="ws-switcher dd-wrap" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="ws-switcher-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="ws-switcher-name">{current.name}</span>
        <ChevronDown size={14} className="dd-caret" />
      </button>
      {open && (
        <div className="dd-menu ws-switcher-menu" role="listbox">
          {workspaces.map((w) => {
            const isActive = w.id === current.id;
            if (renamingId === w.id) {
              return (
                <div key={w.id} className="ws-row ws-row-editing">
                  <input
                    className="text-input"
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename(w.id);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                  />
                  <button
                    className="icon-btn"
                    aria-label="Save"
                    onClick={() => handleRename(w.id)}
                  >
                    <Check size={14} />
                  </button>
                </div>
              );
            }
            return (
              <div key={w.id} className={`ws-row${isActive ? ' is-active' : ''}`}>
                <button
                  type="button"
                  className="ws-row-main"
                  onClick={() => {
                    setCurrent(w.id);
                    setOpen(false);
                  }}
                >
                  <span className="ws-row-check">{isActive ? <Check size={14} /> : null}</span>
                  <span className="ws-row-name">{w.name}</span>
                </button>
                <button
                  className="icon-btn"
                  aria-label="Rename"
                  onClick={() => {
                    setRenameValue(w.name);
                    setRenamingId(w.id);
                  }}
                >
                  <Pencil size={12} />
                </button>
                <button
                  className="icon-btn"
                  aria-label="Delete"
                  onClick={() => handleDelete(w.id, w.name)}
                  disabled={workspaces.length <= 1}
                  title={workspaces.length <= 1 ? 'You need at least one workspace' : 'Delete'}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
          <div className="ws-menu-divider" />
          {creating ? (
            <div className="ws-row ws-row-editing">
              <input
                className="text-input"
                autoFocus
                placeholder="Workspace name…"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') {
                    setCreating(false);
                    setNewName('');
                  }
                }}
              />
              <button className="icon-btn" aria-label="Create" onClick={handleCreate}>
                <Check size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="ws-row ws-row-add"
              onClick={() => setCreating(true)}
            >
              <Plus size={14} />
              <span>New workspace</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
