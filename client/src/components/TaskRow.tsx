import { CSSProperties, useState, KeyboardEvent } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, GripVertical, Star, FileText, ChevronDown, Plus, X, ListPlus } from 'lucide-react';
import { format, isPast, isToday, parseISO } from 'date-fns';
import { STATUS_LABELS, STATUS_ORDER, type Status, type Subtask, type Task, type Workstream } from '../types';
import { useUpdateTask } from '../state/queries';
import { useUI } from '../state/ui';
import { Dropdown } from './Dropdown';
import { useToasts } from './Toast';

function subUid() {
  return Math.random().toString(36).slice(2, 10);
}

interface Props {
  task: Task;
  workstream: Workstream;
  /** Render in "Today" mode: show colored accent strip + workstream name chip */
  todayMode?: boolean;
  sortableId: string;
}

const STATUS_COLORS: Record<Status, string> = {
  not_started: 'var(--text-muted)',
  in_progress: '#2563EB',
  blocked: '#DC2626',
  done: '#16A34A',
};

export function TaskRow({ task, workstream, todayMode, sortableId }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
    data: { type: todayMode ? 'today-task' : 'task', taskId: task.id, workstreamId: task.workstream_id },
  });
  const openDrawer = useUI((s) => s.openDrawer);
  const pushUndo = useUI((s) => s.pushUndo);
  const updateTask = useUpdateTask();
  const pushToast = useToasts((s) => s.push);

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    ...(todayMode ? ({ ['--row-accent' as string]: workstream.color } as CSSProperties) : {}),
  };

  const isDone = !!task.completed_at;
  const [addingSub, setAddingSub] = useState(false);

  const toggleDone = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isDone) {
      // record an undo to revert back to previous state
      pushUndo({
        kind: 'patchTask',
        taskId: task.id,
        patch: { completed: false, status: task.status, today: !!task.today_flag },
        label: `Completed “${task.title}”`,
      });
      pushToast(`Completed “${task.title}” — Ctrl+Z to undo`);
    }
    updateTask.mutate({
      id: task.id,
      body: { completed: !isDone },
    });
  };

  const toggleToday = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateTask.mutate({ id: task.id, body: { today: !task.today_flag } });
  };

  let duePill: React.ReactNode = null;
  if (task.due_date) {
    const d = parseISO(task.due_date);
    const overdue = !isToday(d) && isPast(d) && !isDone;
    duePill = (
      <span className={`due-pill ${overdue ? 'overdue' : ''}`}>
        {isToday(d) ? 'Today' : format(d, 'MMM d')}
      </span>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className={`task-row-wrap ${isDragging ? 'dragging' : ''}`}>
      <div
        className={`task-row ${todayMode ? 'today-row' : ''}`}
        onClick={() => openDrawer(task.id)}
      >
      <button
        className="drag-handle"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        aria-label="Drag"
      >
        <GripVertical size={14} />
      </button>
      <button
        className={`check-btn ${isDone ? 'checked' : ''}`}
        onClick={toggleDone}
        title={isDone ? 'Mark as not done' : 'Mark as done'}
        aria-pressed={isDone}
      >
        {isDone && <Check size={11} strokeWidth={3} />}
      </button>
      <button
        className={`star-btn ${task.today_flag ? 'active' : ''}`}
        onClick={toggleToday}
        title={task.today_flag ? 'Remove from Today' : 'Add to Today'}
      >
        <Star size={14} fill={task.today_flag ? 'currentColor' : 'none'} />
      </button>
      <span className={`task-title ${isDone ? 'done' : ''}`}>{task.title}</span>
      <button
        className="row-action add-subtask-btn"
        onClick={(e) => {
          e.stopPropagation();
          setAddingSub(true);
        }}
        title="Add subtask"
        aria-label="Add subtask"
      >
        <ListPlus size={13} />
      </button>
      {task.notes?.trim() && (
        <span className="notes-indicator" title="Has notes">
          <FileText size={12} />
        </span>
      )}
      {todayMode && (
        <WorkstreamChip workstream={workstream} />
      )}
      {duePill}
      <Dropdown<Status>
        value={task.status}
        onChange={(v) => updateTask.mutate({ id: task.id, body: { status: v } })}
        align="right"
        menuWidth={180}
        ariaLabel="Status"
        triggerClassName="dd-trigger-status"
        renderTrigger={(selected, open) => (
          <span style={{ color: STATUS_COLORS[(selected?.value ?? 'not_started') as Status], display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span className="dot" />
            {selected?.label}
            <ChevronDown size={11} className="dd-caret" style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 120ms' }} />
          </span>
        )}
        options={STATUS_ORDER.map((s) => ({
          value: s,
          label: STATUS_LABELS[s],
          leading: <span className="dd-swatch" style={{ background: STATUS_COLORS[s], border: 'none', borderRadius: '50%', width: 8, height: 8 }} />,
        }))}
      />
      </div>
      <InlineSubtasks task={task} adding={addingSub} onAddingChange={setAddingSub} />
    </div>
  );
}

function InlineSubtasks({
  task,
  adding,
  onAddingChange,
}: {
  task: Task;
  adding: boolean;
  onAddingChange: (v: boolean) => void;
}) {
  const updateTask = useUpdateTask();
  const subs: Subtask[] = task.subtasks ?? [];
  const [newTitle, setNewTitle] = useState('');

  const commit = (next: Subtask[]) => {
    updateTask.mutate({ id: task.id, body: { subtasks: next } });
  };

  const addOne = () => {
    const v = newTitle.trim();
    if (!v) {
      onAddingChange(false);
      setNewTitle('');
      return;
    }
    commit([...subs, { id: subUid(), title: v, done: false }]);
    setNewTitle('');
  };

  const onAddKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addOne();
    } else if (e.key === 'Escape') {
      setNewTitle('');
      onAddingChange(false);
    }
  };

  if (subs.length === 0 && !adding) return null;

  return (
    <div className="inline-subtasks" onClick={(e) => e.stopPropagation()}>
      {subs.map((s) => (
        <InlineSubtaskRow
          key={s.id}
          subtask={s}
          onToggle={() => commit(subs.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)))}
          onRename={(v) => commit(subs.map((x) => (x.id === s.id ? { ...x, title: v } : x)))}
          onRemove={() => commit(subs.filter((x) => x.id !== s.id))}
        />
      ))}
      {adding && (
        <div className="inline-subtask-add">
          <Plus size={11} />
          <input
            value={newTitle}
            autoFocus
            onChange={(e) => setNewTitle(e.target.value)}
            onBlur={() => {
              addOne();
              onAddingChange(false);
            }}
            onKeyDown={onAddKey}
            placeholder="Add subtask…"
          />
        </div>
      )}
    </div>
  );
}

function InlineSubtaskRow({
  subtask,
  onToggle,
  onRename,
  onRemove,
}: {
  subtask: Subtask;
  onToggle: () => void;
  onRename: (v: string) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState(subtask.title);
  const [editing, setEditing] = useState(false);

  const commit = () => {
    const v = draft.trim();
    if (v && v !== subtask.title) onRename(v);
    else setDraft(subtask.title);
    setEditing(false);
  };

  return (
    <div className={`inline-subtask ${subtask.done ? 'done' : ''}`}>
      <button
        className={`check-btn small ${subtask.done ? 'checked' : ''}`}
        onClick={onToggle}
        aria-pressed={subtask.done}
        title={subtask.done ? 'Uncheck' : 'Check'}
      >
        {subtask.done && <Check size={9} strokeWidth={3} />}
      </button>
      {editing ? (
        <input
          className="inline-subtask-input"
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            else if (e.key === 'Escape') {
              setDraft(subtask.title);
              setEditing(false);
            }
          }}
        />
      ) : (
        <span
          className="inline-subtask-title"
          onClick={() => setEditing(true)}
          title="Click to edit"
        >
          {subtask.title}
        </span>
      )}
      <button
        className="inline-subtask-remove"
        onClick={onRemove}
        aria-label="Remove subtask"
        title="Remove"
      >
        <X size={10} />
      </button>
    </div>
  );
}

function WorkstreamChip({ workstream }: { workstream: Workstream }) {
  // Build tinted chip styles from the workstream color
  const style = {
    ['--chip-color' as string]: workstream.color,
    ['--chip-bg' as string]: `color-mix(in srgb, ${workstream.color} 14%, transparent)`,
    ['--chip-border' as string]: `color-mix(in srgb, ${workstream.color} 32%, transparent)`,
  } as CSSProperties;
  return (
    <span className="ws-chip" style={style} title={workstream.name}>
      <span className="ws-chip-dot" />
      {workstream.name}
    </span>
  );
}
