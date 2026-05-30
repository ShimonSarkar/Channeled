import { useEffect, useRef, useState } from 'react';
import { Star, Trash2, X } from 'lucide-react';
import type { AppState, Status } from '../types';
import { STATUS_LABELS, STATUS_ORDER } from '../types';
import { useDeleteTask, useUpdateTask } from '../state/queries';
import { useUI } from '../state/ui';
import { useToasts } from './Toast';
import { Dropdown } from './Dropdown';
import { RichNotes } from './RichNotes';
import { Subtasks } from './Subtasks';

const STATUS_COLORS: Record<Status, string> = {
  not_started: '#9CA3AF',
  in_progress: '#2563EB',
  blocked: '#DC2626',
  done: '#16A34A',
};

export function TaskDrawer({ state }: { state: AppState }) {
  const { drawerTaskId, closeDrawer, pushUndo } = useUI();
  const task = state.tasks.find((t) => t.id === drawerTaskId);
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const pushToast = useToasts((s) => s.push);

  const [titleDraft, setTitleDraft] = useState(task?.title ?? '');
  const [notesDraft, setNotesDraft] = useState(task?.notes ?? '');

  // Per-task ref to track the last committed notes so we don't refire when remote echoes back
  const lastCommittedNotesRef = useRef<string>(task?.notes ?? '');
  const notesDraftRef = useRef<string>(task?.notes ?? '');
  const taskIdRef = useRef<string | undefined>(task?.id);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    setTitleDraft(task?.title ?? '');
    setNotesDraft(task?.notes ?? '');
    lastCommittedNotesRef.current = task?.notes ?? '';
    notesDraftRef.current = task?.notes ?? '';
    taskIdRef.current = task?.id;
  }, [task?.id]);

  // Debounced notes save
  useEffect(() => {
    notesDraftRef.current = notesDraft;
    if (!task) return;
    if (notesDraft === lastCommittedNotesRef.current) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      lastCommittedNotesRef.current = notesDraft;
      updateTask.mutate({ id: task.id, body: { notes: notesDraft } });
    }, 500);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [notesDraft, task?.id]);

  // Flush on unmount / drawer close
  useEffect(() => {
    return () => {
      const latest = notesDraftRef.current;
      if (
        taskIdRef.current &&
        lastCommittedNotesRef.current !== latest
      ) {
        updateTask.mutate({ id: taskIdRef.current, body: { notes: latest } });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!task) return null;

  const workstream = state.workstreams.find((w) => w.id === task.workstream_id);
  const sortedWs = [...state.workstreams].sort((a, b) => a.position - b.position);

  const commitTitle = () => {
    const v = titleDraft.trim();
    if (v && v !== task.title) updateTask.mutate({ id: task.id, body: { title: v } });
    else setTitleDraft(task.title);
  };

  return (
    <>
      <div className="drawer-backdrop" onClick={closeDrawer} />
      <aside className="drawer" role="dialog" aria-label="Task details">
        <div className="drawer-header">
          <button
            className={`star-btn ${task.today_flag ? 'active' : ''}`}
            onClick={() => updateTask.mutate({ id: task.id, body: { today: !task.today_flag } })}
            title="Toggle Today"
          >
            <Star size={16} fill={task.today_flag ? 'currentColor' : 'none'} />
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Task</span>
          <div style={{ flex: 1 }} />
          <button
            className="icon-btn"
            onClick={() => {
              if (window.confirm('Move this task to trash?')) {
                pushUndo({ kind: 'restoreTask', taskId: task.id, label: `“${task.title}”` });
                deleteTask.mutate(task.id, {
                  onSuccess: () => {
                    closeDrawer();
                    pushToast(`Deleted “${task.title}” — Ctrl+Z to undo`);
                  },
                  onError: (e) => pushToast(`Delete failed: ${(e as Error).message}`, 'error'),
                });
              }
            }}
            aria-label="Delete"
            title="Move to trash"
          >
            <Trash2 size={15} />
          </button>
          <button className="icon-btn" onClick={closeDrawer} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="drawer-body">
          <input
            className="drawer-title"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            placeholder="Untitled task"
          />

          <div className="field">
            <span className="field-label">Status</span>
            <div>
              <Dropdown<Status>
                value={task.status}
                onChange={(v) => updateTask.mutate({ id: task.id, body: { status: v } })}
                ariaLabel="Status"
                menuWidth={200}
                options={STATUS_ORDER.map((s) => ({
                  value: s,
                  label: STATUS_LABELS[s],
                  leading: (
                    <span
                      className="dd-swatch"
                      style={{ background: STATUS_COLORS[s], borderRadius: '50%', width: 9, height: 9, border: 'none' }}
                    />
                  ),
                }))}
              />
            </div>
          </div>

          <div className="field">
            <span className="field-label">Workstream</span>
            <div>
              <Dropdown<string>
                value={task.workstream_id}
                onChange={(v) => updateTask.mutate({ id: task.id, body: { workstreamId: v } })}
                ariaLabel="Workstream"
                triggerClassName="dd-trigger-ws"
                menuWidth={240}
                renderTrigger={(_sel, open) => (
                  <>
                    <span className="ws-swatch" style={{ background: workstream?.color }} />
                    <span className="ws-label">{workstream?.name ?? '—'}</span>
                    <Caret open={open} />
                  </>
                )}
                options={sortedWs.map((w) => ({
                  value: w.id,
                  label: w.name,
                  color: w.color,
                }))}
              />
            </div>
          </div>

          <div className="field">
            <span className="field-label">Due date</span>
            <input
              type="date"
              value={task.due_date ? task.due_date.slice(0, 10) : ''}
              onChange={(e) =>
                updateTask.mutate({
                  id: task.id,
                  body: { dueDate: e.target.value || null },
                })
              }
            />
          </div>

          <Subtasks task={task} />

          <div className="notes-section">
            <div className="notes-section-label">Notes</div>
            <RichNotes key={task.id} value={notesDraft} onChange={setNotesDraft} />
            <div className="notes-hint">
              Markdown shortcuts: <span className="kbd"># </span> heading · <span className="kbd">- </span> list ·
              {' '}<span className="kbd">[] </span> to-do · <span className="kbd">**bold**</span> · <span className="kbd">`code`</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      className="dd-caret"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 120ms' }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
