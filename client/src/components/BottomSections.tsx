import { useMemo } from 'react';
import { CheckCircle2, ChevronRight, RotateCcw, Trash2, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { AppState, Task, Workstream } from '../types';
import {
  useEmptyTrash,
  usePermanentDeleteTask,
  useRestoreTask,
  useUpdateTask,
} from '../state/queries';
import { useUI } from '../state/ui';

export function BottomSections({ state }: { state: AppState }) {
  const wsById = useMemo(
    () => new Map(state.workstreams.map((w) => [w.id, w])),
    [state.workstreams]
  );
  const completed = useMemo(
    () =>
      state.tasks
        .filter((t) => !!t.completed_at && !t.deleted_at)
        .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')),
    [state.tasks]
  );
  const trashed = useMemo(
    () =>
      state.tasks
        .filter((t) => !!t.deleted_at)
        .sort((a, b) => (b.deleted_at ?? '').localeCompare(a.deleted_at ?? '')),
    [state.tasks]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <CompletedSection items={completed} wsById={wsById} />
      <TrashSection items={trashed} wsById={wsById} />
    </div>
  );
}

function CompletedSection({
  items,
  wsById,
}: {
  items: Task[];
  wsById: Map<string, Workstream>;
}) {
  const updateTask = useUpdateTask();
  const openDrawer = useUI((s) => s.openDrawer);

  return (
    <details className="bottom-section">
      <summary>
        <ChevronRight size={14} className="chev" />
        <CheckCircle2 size={15} style={{ color: '#16A34A' }} />
        Completed
        <span className="count">{items.length}</span>
        <div className="spacer" />
      </summary>
      <div className="bottom-section-body">
        {items.length === 0 ? (
          <div className="bottom-empty">No completed tasks yet.</div>
        ) : (
          items.map((t) => {
            const ws = wsById.get(t.workstream_id);
            const completedAt = t.completed_at ? formatDateTime(t.completed_at) : '';
            return (
              <div key={t.id} className="trash-row" onClick={() => openDrawer(t.id)} style={{ cursor: 'pointer' }}>
                <button
                  className="check-btn checked"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateTask.mutate({ id: t.id, body: { status: 'not_started' } });
                  }}
                  title="Mark as not done"
                >
                  <CheckIcon />
                </button>
                {ws && (
                  <span
                    className="ws-chip"
                    style={chipStyle(ws.color)}
                  >
                    <span className="ws-chip-dot" />
                    {ws.name}
                  </span>
                )}
                <span className="trash-title">{t.title}</span>
                <span className="trash-meta">{completedAt}</span>
              </div>
            );
          })
        )}
      </div>
    </details>
  );
}

function TrashSection({
  items,
  wsById,
}: {
  items: Task[];
  wsById: Map<string, Workstream>;
}) {
  const restore = useRestoreTask();
  const perm = usePermanentDeleteTask();
  const empty = useEmptyTrash();

  return (
    <details className="bottom-section">
      <summary>
        <ChevronRight size={14} className="chev" />
        <Trash2 size={15} style={{ color: 'var(--text-muted)' }} />
        Trash
        <span className="count">{items.length}</span>
        <div className="spacer" />
        {items.length > 0 && (
          <button
            className="btn btn-ghost btn-danger"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (window.confirm(`Permanently delete ${items.length} task${items.length === 1 ? '' : 's'}?`)) {
                empty.mutate();
              }
            }}
            style={{ height: 26 }}
          >
            Empty trash
          </button>
        )}
      </summary>
      <div className="bottom-section-body">
        {items.length === 0 ? (
          <div className="bottom-empty">Trash is empty.</div>
        ) : (
          items.map((t) => {
            const ws = wsById.get(t.workstream_id);
            const deletedAt = t.deleted_at ? formatDateTime(t.deleted_at) : '';
            return (
              <div key={t.id} className="trash-row">
                {ws && (
                  <span className="ws-chip" style={chipStyle(ws.color)}>
                    <span className="ws-chip-dot" />
                    {ws.name}
                  </span>
                )}
                <span className="trash-title">{t.title}</span>
                <span className="trash-meta">Deleted {deletedAt}</span>
                <div className="trash-actions">
                  <button
                    className="icon-btn"
                    title="Restore"
                    onClick={() => restore.mutate(t.id)}
                  >
                    <RotateCcw size={14} />
                  </button>
                  <button
                    className="icon-btn"
                    title="Delete forever"
                    onClick={() => {
                      if (window.confirm('Delete this task forever?')) perm.mutate(t.id);
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </details>
  );
}

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function formatDateTime(iso: string): string {
  try {
    // SQLite-format dates ("YYYY-MM-DD HH:MM:SS") aren't ISO; normalise
    const norm = iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z';
    return format(parseISO(norm), 'MMM d, h:mm a');
  } catch {
    return iso;
  }
}

function chipStyle(color: string) {
  return {
    ['--chip-color' as string]: color,
    ['--chip-bg' as string]: `color-mix(in srgb, ${color} 14%, transparent)`,
    ['--chip-border' as string]: `color-mix(in srgb, ${color} 32%, transparent)`,
  } as React.CSSProperties;
}
