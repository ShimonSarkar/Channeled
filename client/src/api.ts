import type { AppState, Status, Subtask, Task, Workstream } from './types';

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let detail: unknown = null;
    try { detail = await res.json(); } catch { /* ignore */ }
    throw new Error(`${res.status} ${res.statusText}: ${JSON.stringify(detail)}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  getState: () => http<AppState>('/api/state'),

  createWorkstream: (body: { name: string; color: string; notes?: string }) =>
    http<Workstream>('/api/workstreams', { method: 'POST', body: JSON.stringify(body) }),
  updateWorkstream: (id: string, body: { name?: string; color?: string; notes?: string }) =>
    http<Workstream>(`/api/workstreams/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteWorkstream: (id: string) =>
    http<void>(`/api/workstreams/${id}`, { method: 'DELETE' }),
  reorderWorkstreams: (orderedIds: string[]) =>
    http<void>('/api/workstreams/reorder', { method: 'POST', body: JSON.stringify({ orderedIds }) }),

  createTask: (body: {
    workstreamId?: string;
    title: string;
    notes?: string;
    dueDate?: string | null;
    status?: Status;
    today?: boolean;
    subtasks?: Subtask[];
  }) => http<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(body) }),
  updateTask: (id: string, body: Partial<{
    workstreamId: string;
    title: string;
    notes: string;
    dueDate: string | null;
    status: Status;
    today: boolean;
    completed: boolean;
    subtasks: Subtask[];
  }>) => http<Task>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteTask: (id: string) =>
    http<void>(`/api/tasks/${id}`, { method: 'DELETE' }),
  restoreTask: (id: string) =>
    http<Task>(`/api/tasks/${id}/restore`, { method: 'POST' }),
  permanentDeleteTask: (id: string) =>
    http<void>(`/api/tasks/${id}/permanent`, { method: 'DELETE' }),
  emptyTrash: () =>
    http<void>('/api/tasks/trash/empty', { method: 'POST' }),
  reorderTasks: (body: { scope: 'workstream' | 'today'; workstreamId?: string; orderedIds: string[] }) =>
    http<void>('/api/tasks/reorder', { method: 'POST', body: JSON.stringify(body) }),
};
