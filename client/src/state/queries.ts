import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { AppState, Status, Subtask, Task } from '../types';

export const STATE_KEY = ['state'] as const;

export function useAppState() {
  return useQuery({ queryKey: STATE_KEY, queryFn: api.getState, staleTime: 1000 * 30 });
}

function patchState(qc: ReturnType<typeof useQueryClient>, updater: (s: AppState) => AppState) {
  qc.setQueryData<AppState>(STATE_KEY, (s) => (s ? updater(s) : s));
}

export function useCreateWorkstream() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createWorkstream,
    onSuccess: () => qc.invalidateQueries({ queryKey: STATE_KEY }),
  });
}
export function useUpdateWorkstream() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; body: { name?: string; color?: string; notes?: string } }) =>
      api.updateWorkstream(v.id, v.body),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: STATE_KEY });
      const prev = qc.getQueryData<AppState>(STATE_KEY);
      patchState(qc, (s) => ({
        ...s,
        workstreams: s.workstreams.map((w) => (w.id === v.id ? { ...w, ...v.body } : w)),
      }));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(STATE_KEY, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: STATE_KEY }),
  });
}
export function useDeleteWorkstream() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteWorkstream,
    onSuccess: () => qc.invalidateQueries({ queryKey: STATE_KEY }),
  });
}
export function useReorderWorkstreams() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.reorderWorkstreams,
    onMutate: async (orderedIds) => {
      await qc.cancelQueries({ queryKey: STATE_KEY });
      const prev = qc.getQueryData<AppState>(STATE_KEY);
      patchState(qc, (s) => ({
        ...s,
        workstreams: orderedIds
          .map((id, i) => {
            const w = s.workstreams.find((x) => x.id === id);
            return w ? { ...w, position: i } : null;
          })
          .filter(Boolean) as AppState['workstreams'],
      }));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(STATE_KEY, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: STATE_KEY }),
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createTask,
    onSuccess: () => qc.invalidateQueries({ queryKey: STATE_KEY }),
  });
}
export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; body: Parameters<typeof api.updateTask>[1] }) =>
      api.updateTask(v.id, v.body),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: STATE_KEY });
      const prev = qc.getQueryData<AppState>(STATE_KEY);
      patchState(qc, (s) => ({
        ...s,
        tasks: s.tasks.map((t): Task => {
          if (t.id !== v.id) return t;
          const b = v.body;
          let next: Task = { ...t };
          if (b.completed !== undefined) {
            if (b.completed) {
              next = {
                ...next,
                completed_at: new Date().toISOString(),
                status: 'done',
                today_flag: 0,
                today_position: null,
              };
            } else {
              next = {
                ...next,
                completed_at: null,
                status: next.status === 'done' ? 'not_started' : next.status,
              };
            }
          }
          if (b.title !== undefined) next.title = b.title;
          if (b.notes !== undefined) next.notes = b.notes;
          if (b.dueDate !== undefined) next.due_date = b.dueDate;
          if (b.status !== undefined) next.status = b.status as Status;
          if (b.workstreamId !== undefined) next.workstream_id = b.workstreamId;
          if (b.today !== undefined) next.today_flag = b.today ? 1 : 0;
          if (b.subtasks !== undefined) next.subtasks = b.subtasks as Subtask[];
          return next;
        }),
      }));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(STATE_KEY, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: STATE_KEY }),
  });
}
export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteTask,
    onSuccess: () => qc.invalidateQueries({ queryKey: STATE_KEY }),
  });
}
export function useRestoreTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.restoreTask,
    onSuccess: () => qc.invalidateQueries({ queryKey: STATE_KEY }),
  });
}
export function usePermanentDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.permanentDeleteTask,
    onSuccess: () => qc.invalidateQueries({ queryKey: STATE_KEY }),
  });
}
export function useEmptyTrash() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.emptyTrash,
    onSuccess: () => qc.invalidateQueries({ queryKey: STATE_KEY }),
  });
}
export function useReorderTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.reorderTasks,
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: STATE_KEY });
      const prev = qc.getQueryData<AppState>(STATE_KEY);
      patchState(qc, (s) => {
        const idIndex = new Map(v.orderedIds.map((id, i) => [id, i]));
        return {
          ...s,
          tasks: s.tasks.map((t) => {
            if (!idIndex.has(t.id)) return t;
            const i = idIndex.get(t.id)!;
            if (v.scope === 'workstream') {
              return {
                ...t,
                position: i,
                ...(v.workstreamId ? { workstream_id: v.workstreamId } : {}),
              };
            }
            return { ...t, today_position: i, today_flag: 1 };
          }),
        };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(STATE_KEY, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: STATE_KEY }),
  });
}
