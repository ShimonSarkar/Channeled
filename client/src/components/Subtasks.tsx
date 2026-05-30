import { useEffect, useState } from 'react';
import { Check, GripVertical, Plus, X } from 'lucide-react';
import type { Subtask, Task } from '../types';
import { useUpdateTask } from '../state/queries';

interface Props {
  task: Task;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function Subtasks({ task }: Props) {
  const updateTask = useUpdateTask();
  const subs: Subtask[] = task.subtasks ?? [];
  const [newTitle, setNewTitle] = useState('');

  const commit = (next: Subtask[]) => {
    updateTask.mutate({ id: task.id, body: { subtasks: next } });
  };

  const addOne = () => {
    const v = newTitle.trim();
    if (!v) return;
    commit([...subs, { id: uid(), title: v, done: false }]);
    setNewTitle('');
  };

  const toggleAt = (id: string) => {
    commit(subs.map((s) => (s.id === id ? { ...s, done: !s.done } : s)));
  };

  const removeAt = (id: string) => {
    commit(subs.filter((s) => s.id !== id));
  };

  const renameAt = (id: string, title: string) => {
    commit(subs.map((s) => (s.id === id ? { ...s, title } : s)));
  };

  const doneCount = subs.filter((s) => s.done).length;

  return (
    <div className="subtasks">
      <div className="subtasks-header">
        <span className="field-label">Checklist</span>
        {subs.length > 0 && (
          <>
            <span className="subtasks-count">
              {doneCount}/{subs.length}
            </span>
            <div className="subtasks-progress">
              <div
                className="subtasks-progress-bar"
                style={{ width: `${(doneCount / subs.length) * 100}%` }}
              />
            </div>
          </>
        )}
      </div>
      <div className="subtasks-list">
        {subs.map((s) => (
          <SubtaskRow
            key={s.id}
            subtask={s}
            onToggle={() => toggleAt(s.id)}
            onRename={(v) => renameAt(s.id, v)}
            onRemove={() => removeAt(s.id)}
          />
        ))}
      </div>
      <div className="subtask-add">
        <Plus size={14} />
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addOne();
            }
          }}
          placeholder="Add a subtask…"
        />
      </div>
    </div>
  );
}

function SubtaskRow({
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

  useEffect(() => {
    setDraft(subtask.title);
  }, [subtask.title]);

  const commit = () => {
    const v = draft.trim();
    if (v && v !== subtask.title) onRename(v);
    else setDraft(subtask.title);
  };

  return (
    <div className={`subtask-row ${subtask.done ? 'done' : ''}`}>
      <GripVertical size={12} className="subtask-grip" />
      <button
        className={`check-btn small ${subtask.done ? 'checked' : ''}`}
        onClick={onToggle}
        aria-pressed={subtask.done}
        title={subtask.done ? 'Uncheck' : 'Check'}
      >
        {subtask.done && <Check size={10} strokeWidth={3} />}
      </button>
      <input
        className="subtask-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setDraft(subtask.title);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <button className="subtask-remove" onClick={onRemove} aria-label="Remove subtask" title="Remove">
        <X size={12} />
      </button>
    </div>
  );
}
