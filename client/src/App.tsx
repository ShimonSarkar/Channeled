import { useEffect, useMemo } from 'react';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  useAppState,
  useReorderTasks,
  useReorderWorkstreams,
  useUpdateTask,
  useRestoreTask,
} from './state/queries';
import { useUI } from './state/ui';
import { TopBar } from './components/TopBar';
import { TodayPanel } from './components/TodayPanel';
import { WorkstreamsList } from './components/WorkstreamsList';
import { BottomSections } from './components/BottomSections';
import { TaskDrawer } from './components/TaskDrawer';
import { QuickAddModal } from './components/QuickAddModal';
import { ToastHost, useToasts } from './components/Toast';
import { DueBanner } from './components/DueBanner';

export default function App() {
  const { data, isLoading, error } = useAppState();
  const { setQuickAdd, closeDrawer, drawerTaskId, quickAddOpen, popUndo } = useUI();
  const reorderTasks = useReorderTasks();
  const reorderWs = useReorderWorkstreams();
  const updateTask = useUpdateTask();
  const restoreTask = useRestoreTask();
  const pushToast = useToasts((s) => s.push);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Global keyboard shortcuts (incl. Undo)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const editable = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (e.key === 'Escape') {
        if (quickAddOpen) setQuickAdd(false);
        else if (drawerTaskId) closeDrawer();
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        // Don't hijack native undo while typing
        if (editable) return;
        e.preventDefault();
        const action = popUndo();
        if (!action) {
          pushToast('Nothing to undo.');
          return;
        }
        if (action.kind === 'restoreTask') {
          restoreTask.mutate(action.taskId, {
            onSuccess: () => pushToast(`Restored ${action.label}`),
            onError: (err) => pushToast(`Undo failed: ${(err as Error).message}`, 'error'),
          });
        } else if (action.kind === 'patchTask') {
          updateTask.mutate(
            { id: action.taskId, body: action.patch },
            {
              onSuccess: () => pushToast(`Undone: ${action.label}`),
              onError: (err) => pushToast(`Undo failed: ${(err as Error).message}`, 'error'),
            }
          );
        }
        return;
      }
      if (editable) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setQuickAdd(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [quickAddOpen, drawerTaskId, setQuickAdd, closeDrawer, popUndo, restoreTask, updateTask, pushToast]);

  const onDragEnd = useMemo(
    () =>
      function handleDragEnd(e: DragEndEvent) {
        if (!data) return;
        const { active, over } = e;
        if (!over) return;
        if (active.id === over.id) return;
        const aData = active.data.current as
          | { type?: string; taskId?: string; workstreamId?: string }
          | undefined;
        const oData = over.data.current as
          | { type?: string; taskId?: string; workstreamId?: string }
          | undefined;

        // 1. Workstream reorder
        if (aData?.type === 'workstream' && oData?.type === 'workstream') {
          const sortedWs = [...data.workstreams].sort((x, y) => x.position - y.position);
          const ids = sortedWs.map((w) => w.id);
          const from = ids.indexOf(String(active.id));
          const to = ids.indexOf(String(over.id));
          if (from < 0 || to < 0) return;
          const next = [...ids];
          next.splice(to, 0, next.splice(from, 1)[0]);
          reorderWs.mutate(next);
          return;
        }

        // 2. Today-task reorder within Today
        if (aData?.type === 'today-task' && (oData?.type === 'today-task' || oData?.type === 'today-drop')) {
          const todayIds = data.tasks
            .filter((t) => t.today_flag && !t.completed_at && !t.deleted_at)
            .sort((a, b) => (a.today_position ?? 0) - (b.today_position ?? 0))
            .map((t) => t.id);
          const fromId = String(active.id).replace(/^today-/, '');
          const toId = oData?.type === 'today-task' ? String(over.id).replace(/^today-/, '') : null;
          const from = todayIds.indexOf(fromId);
          if (from < 0) return;
          const next = [...todayIds];
          next.splice(from, 1);
          if (toId) {
            const to = next.indexOf(toId);
            next.splice(to < 0 ? next.length : to, 0, fromId);
          } else {
            next.push(fromId);
          }
          reorderTasks.mutate({ scope: 'today', orderedIds: next });
          return;
        }

        // 3. Regular task drag — within same workstream, or into Today
        if (aData?.type === 'task') {
          const taskId = aData.taskId!;
          const sourceWsId = aData.workstreamId!;

          // → drop into Today area
          if (oData?.type === 'today-task' || oData?.type === 'today-drop') {
            updateTask.mutate({ id: taskId, body: { today: true } });
            return;
          }

          // Only allow reordering within the SAME workstream
          if (oData?.type !== 'task') return;
          if (oData.workstreamId !== sourceWsId) return;
          const overTaskId = oData.taskId ?? null;
          if (!overTaskId) return;

          const destTasks = data.tasks
            .filter((t) => t.workstream_id === sourceWsId && !t.completed_at && !t.deleted_at)
            .sort((a, b) => a.position - b.position);
          const destIds = destTasks.map((t) => t.id).filter((id) => id !== taskId);
          const i = destIds.indexOf(overTaskId);
          const insertAt = i < 0 ? destIds.length : i;
          destIds.splice(insertAt, 0, taskId);

          reorderTasks.mutate({ scope: 'workstream', workstreamId: sourceWsId, orderedIds: destIds });
          return;
        }
      },
    [data, reorderWs, reorderTasks, updateTask]
  );

  return (
    <div className="app">
      <TopBar />
      <main className="main">
        {isLoading && <div style={{ color: 'var(--text-faint)' }}>Loading…</div>}
        {error && <div style={{ color: 'var(--danger)' }}>Failed to load: {(error as Error).message}</div>}
        {data && (
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
            <DueBanner state={data} />
            <TodayPanel state={data} />
            <WorkstreamsList state={data} />
            <BottomSections state={data} />
          </DndContext>
        )}
      </main>
      {drawerTaskId && data && <TaskDrawer state={data} />}
      {quickAddOpen && data && <QuickAddModal state={data} />}
      <ToastHost />
    </div>
  );
}
