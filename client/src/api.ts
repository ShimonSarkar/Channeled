import type { AppState, Status, Subtask, Task, Workspace, Workstream } from './types';

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
  getState: (workspaceId?: string | null) =>
    http<AppState>(
      workspaceId ? `/api/state?workspaceId=${encodeURIComponent(workspaceId)}` : '/api/state'
    ),

  listWorkspaces: () => http<Workspace[]>('/api/workspaces'),
  createWorkspace: (body: { name: string }) =>
    http<Workspace>('/api/workspaces', { method: 'POST', body: JSON.stringify(body) }),
  updateWorkspace: (id: string, body: { name?: string }) =>
    http<Workspace>(`/api/workspaces/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteWorkspace: (id: string) =>
    http<void>(`/api/workspaces/${id}`, { method: 'DELETE' }),

  createWorkstream: (body: { workspaceId?: string; name: string; color: string; notes?: string }) =>
    http<Workstream>('/api/workstreams', { method: 'POST', body: JSON.stringify(body) }),
  updateWorkstream: (id: string, body: { name?: string; color?: string; notes?: string }) =>
    http<Workstream>(`/api/workstreams/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteWorkstream: (id: string) =>
    http<void>(`/api/workstreams/${id}`, { method: 'DELETE' }),
  reorderWorkstreams: (orderedIds: string[]) =>
    http<void>('/api/workstreams/reorder', { method: 'POST', body: JSON.stringify({ orderedIds }) }),

  createTask: (body: {
    workspaceId?: string;
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
