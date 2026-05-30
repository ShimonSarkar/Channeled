import { useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Star } from 'lucide-react';
import type { AppState } from '../types';
import { TaskRow } from './TaskRow';

export function TodayPanel({ state }: { state: AppState }) {
  const todayTasks = useMemo(() => {
    return state.tasks
      .filter((t) => t.today_flag && !t.completed_at && !t.deleted_at)
      .sort((a, b) => (a.today_position ?? 0) - (b.today_position ?? 0));
  }, [state.tasks]);

  const workstreamById = useMemo(
    () => new Map(state.workstreams.map((w) => [w.id, w])),
    [state.workstreams]
  );

  const { setNodeRef, isOver } = useDroppable({
    id: 'today-drop',
    data: { type: 'today-drop' },
  });

  return (
    <section className="today-panel">
      <div className="today-header">
        <Star size={16} style={{ color: '#F59E0B' }} fill="#F59E0B" />
        <h2>Work on Today</h2>
        <span className="count">{todayTasks.length}</span>
      </div>
      <SortableContext items={todayTasks.map((t) => `today-${t.id}`)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={`today-droparea ${isOver ? 'is-over' : ''}`}>
          {todayTasks.length === 0 ? (
            <div className="today-empty">Drop a task here, or star one to add it.</div>
          ) : (
            todayTasks.map((t) => {
              const ws = workstreamById.get(t.workstream_id);
              if (!ws) return null;
              return (
                <TaskRow key={t.id} task={t} workstream={ws} todayMode sortableId={`today-${t.id}`} />
              );
            })
          )}
        </div>
      </SortableContext>
    </section>
  );
}
