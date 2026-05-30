import { useMemo, useState, useEffect, useRef } from 'react';
import { DndContext } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronRight, FileText, GripVertical, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import type { AppState, Task, Workstream } from '../types';
import { TaskRow } from './TaskRow';
import { ColorPicker } from './ColorPicker';
import { WorkstreamCreator } from './WorkstreamCreator';
import { RichNotes } from './RichNotes';
import {
  useCreateTask,
  useCreateWorkstream,
  useDeleteWorkstream,
  useUpdateWorkstream,
} from '../state/queries';
import { useToasts } from './Toast';

export function WorkstreamsList({ state }: { state: AppState }) {
  const createWs = useCreateWorkstream();
  const pushToast = useToasts((s) => s.push);
  const [creating, setCreating] = useState(false);

  const sortedWs = useMemo(
    () => [...state.workstreams].sort((a, b) => a.position - b.position),
    [state.workstreams]
  );

  const handleCreate = (name: string, color: string) => {
    createWs.mutate(
      { name, color },
      {
        onSuccess: () => setCreating(false),
        onError: (err) => pushToast(`Create failed: ${(err as Error).message}`, 'error'),
      }
    );
  };

  return (
    <SortableContext items={sortedWs.map((w) => w.id)} strategy={verticalListSortingStrategy}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {sortedWs.map((ws) => (
          <WorkstreamSection
            key={ws.id}
            workstream={ws}
            tasks={state.tasks.filter((t) => t.workstream_id === ws.id && !t.deleted_at)}
          />
        ))}
        {creating ? (
          <div className="section" style={{ padding: 4 }}>
            <WorkstreamCreator
              autoFocus
              onCreate={handleCreate}
              onCancel={() => setCreating(false)}
            />
          </div>
        ) : (
          <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setCreating(true)}>
            <Plus size={14} /> Add workstream
          </button>
        )}
      </div>
    </SortableContext>
  );
}

function WorkstreamSection({ workstream, tasks }: { workstream: Workstream; tasks: Task[] }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: workstream.id,
    data: { type: 'workstream', workstreamId: workstream.id },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const updateWs = useUpdateWorkstream();
  const deleteWs = useDeleteWorkstream();
  const createTask = useCreateTask();
  const pushToast = useToasts((s) => s.push);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState(workstream.notes ?? '');
  const [newTitle, setNewTitle] = useState('');
  const titleRef = useRef<HTMLSpanElement>(null);
  const lastCommittedNotesRef = useRef<string>(workstream.notes ?? '');
  const notesDebounceRef = useRef<number | null>(null);

  const active = useMemo(
    () => tasks.filter((t) => !t.completed_at).sort((a, b) => a.position - b.position),
    [tasks]
  );
  const completed = useMemo(
    () => tasks.filter((t) => !!t.completed_at).sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')),
    [tasks]
  );

  // Close menus on outside click
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen && !pickerOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen, pickerOpen]);

  // Sync notes draft when remote workstream changes (e.g. after a save echoes back)
  useEffect(() => {
    if (workstream.notes !== lastCommittedNotesRef.current) {
      lastCommittedNotesRef.current = workstream.notes ?? '';
      setNotesDraft(workstream.notes ?? '');
    }
  }, [workstream.notes]);

  // Debounced save for notes
  useEffect(() => {
    if (notesDraft === lastCommittedNotesRef.current) return;
    if (notesDebounceRef.current) window.clearTimeout(notesDebounceRef.current);
    notesDebounceRef.current = window.setTimeout(() => {
      lastCommittedNotesRef.current = notesDraft;
      updateWs.mutate({ id: workstream.id, body: { notes: notesDraft } });
    }, 500);
    return () => {
      if (notesDebounceRef.current) window.clearTimeout(notesDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notesDraft]);

  const commitRename = () => {
    const name = titleRef.current?.textContent?.trim() ?? '';
    if (name && name !== workstream.name) {
      updateWs.mutate({ id: workstream.id, body: { name } });
    } else if (titleRef.current) {
      titleRef.current.textContent = workstream.name;
    }
  };

  const handleDelete = () => {
    if (workstream.is_misc) {
      pushToast('Misc workstream cannot be deleted.', 'error');
      return;
    }
    if (!window.confirm(`Delete "${workstream.name}" and all its tasks?`)) return;
    deleteWs.mutate(workstream.id, {
      onError: (err) => pushToast(`Delete failed: ${(err as Error).message}`, 'error'),
    });
  };

  const submitNewTask = () => {
    const t = newTitle.trim();
    if (!t) return;
    createTask.mutate(
      { workstreamId: workstream.id, title: t },
      {
        onError: (err) => pushToast(`Add failed: ${(err as Error).message}`, 'error'),
      }
    );
    setNewTitle('');
  };

  return (
    <section
      ref={setNodeRef}
      style={{ ...style, ['--section-accent' as string]: workstream.color }}
      className="section"
    >
      <div className="section-header">
        <button className="drag-handle" {...attributes} {...listeners} aria-label="Drag workstream">
          <GripVertical size={14} />
        </button>
        <button
          className="section-swatch"
          style={{ background: workstream.color }}
          onClick={() => {
            setPickerOpen((v) => !v);
            setMenuOpen(false);
          }}
          aria-label="Change color"
        />
        <span
          ref={titleRef}
          className="section-title"
          contentEditable
          suppressContentEditableWarning
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.target as HTMLElement).blur();
            }
          }}
        >
          {workstream.name}
        </span>
        <span className="section-count">{active.length}</span>
        <div style={{ flex: 1 }} />
        <button
          className={`icon-btn ${notesOpen ? 'active' : ''}`}
          onClick={() => setNotesOpen((v) => !v)}
          aria-label="Workstream notes"
          title={notesOpen ? 'Hide notes' : 'Show notes'}
          aria-pressed={notesOpen}
        >
          <FileText size={15} />
        </button>
        <button
          className="icon-btn"
          onClick={() => createTask.mutate({ workstreamId: workstream.id, title: 'New task' })}
          aria-label="Add task"
          title="Add task"
        >
          <Plus size={16} />
        </button>
        <div style={{ position: 'relative' }} ref={menuRef}>
          <button
            className="icon-btn"
            onClick={() => {
              setMenuOpen((v) => !v);
              setPickerOpen(false);
            }}
            aria-label="More"
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <div className="menu" style={{ right: 0, top: 36 }}>
              <button
                className="menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  setPickerOpen(true);
                }}
              >
                Change color
              </button>
              <button className="menu-item danger" onClick={handleDelete}>
                <Trash2 size={13} /> Delete workstream
              </button>
            </div>
          )}
          {pickerOpen && (
            <div className="menu" style={{ right: 0, top: 36 }}>
              <ColorPicker
                value={workstream.color}
                onSelect={(c) => {
                  updateWs.mutate({ id: workstream.id, body: { color: c } });
                  setPickerOpen(false);
                }}
              />
            </div>
          )}
        </div>
      </div>
      <div className="section-body">
        {notesOpen && (
          <div className="ws-notes">
            <RichNotes
              key={`ws-notes-${workstream.id}`}
              value={notesDraft}
              onChange={setNotesDraft}
              placeholder="Workstream notes — goals, context, links…"
            />
          </div>
        )}
        <SortableContext items={active.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="ws-tasks">
            {active.map((t) => (
              <TaskRow key={t.id} task={t} workstream={workstream} sortableId={t.id} />
            ))}
            {active.length === 0 && (
              <div className="ws-empty">No tasks yet</div>
            )}
          </div>
        </SortableContext>
        <div className="add-task-row">
          <Plus size={14} />
          <input
            placeholder="Add a task…"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitNewTask();
            }}
          />
        </div>
        {completed.length > 0 && (
          <details className="completed-disclosure">
            <summary>
              <ChevronRight size={12} style={{ transition: 'transform 120ms' }} className="chev" />
              Completed ({completed.length})
            </summary>
            <div>
              {completed.map((t) => (
                <DummyCompletedRow key={t.id} task={t} workstream={workstream} />
              ))}
            </div>
          </details>
        )}
      </div>
    </section>
  );
}

// Completed rows don't need drag, but reuse styling
function DummyCompletedRow({ task, workstream }: { task: Task; workstream: Workstream }) {
  // Provide a sortable wrapper-free row that mirrors TaskRow visuals
  return (
    <FakeSortableProvider id={`completed-${task.id}`}>
      <TaskRow task={task} workstream={workstream} sortableId={`completed-${task.id}`} />
    </FakeSortableProvider>
  );
}

// Tiny inline DndContext so useSortable inside TaskRow doesn't throw
function FakeSortableProvider({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <DndContext>
      <SortableContext items={[id]}>{children}</SortableContext>
    </DndContext>
  );
}
