import { useMemo } from 'react';
import { AlertTriangle, Calendar, Plus } from 'lucide-react';
import { isPast, isToday, parseISO } from 'date-fns';
import type { AppState } from '../types';
import { useUpdateTask } from '../state/queries';
import { useToasts } from './Toast';

export function DueBanner({ state }: { state: AppState }) {
  const updateTask = useUpdateTask();
  const pushToast = useToasts((s) => s.push);

  const { overdue, dueToday } = useMemo(() => {
    const overdue: typeof state.tasks = [];
    const dueToday: typeof state.tasks = [];
    for (const t of state.tasks) {
      if (t.deleted_at) continue;
      if (t.completed_at) continue;
      if (!t.due_date) continue;
      const d = parseISO(t.due_date);
      if (isToday(d)) dueToday.push(t);
      else if (isPast(d)) overdue.push(t);
    }
    return { overdue, dueToday };
  }, [state.tasks]);

  const total = overdue.length + dueToday.length;
  if (total === 0) return null;

  const notYetToday = [...overdue, ...dueToday].filter((t) => !t.today_flag);

  const addAllToToday = () => {
    if (notYetToday.length === 0) {
      pushToast('All due tasks are already in Today.');
      return;
    }
    for (const t of notYetToday) {
      updateTask.mutate({ id: t.id, body: { today: true } });
    }
    pushToast(`Added ${notYetToday.length} task${notYetToday.length === 1 ? '' : 's'} to Today.`);
  };

  return (
    <div className={`due-banner ${overdue.length > 0 ? 'has-overdue' : ''}`}>
      <div className="due-banner-icon">
        {overdue.length > 0 ? <AlertTriangle size={15} /> : <Calendar size={15} />}
      </div>
      <div className="due-banner-text">
        {overdue.length > 0 && (
          <span className="due-chip overdue">
            {overdue.length} overdue
          </span>
        )}
        {dueToday.length > 0 && (
          <span className="due-chip today">
            {dueToday.length} due today
          </span>
        )}
      </div>
      <div style={{ flex: 1 }} />
      {notYetToday.length > 0 && (
        <button className="btn btn-ghost" onClick={addAllToToday} title="Add all to Today">
          <Plus size={13} /> Add {notYetToday.length} to Today
        </button>
      )}
    </div>
  );
}
