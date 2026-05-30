export type Status = 'not_started' | 'in_progress' | 'blocked' | 'done';

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  position: number;
  created_at: string;
}

export interface Workstream {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
  position: number;
  is_misc: number;
  notes: string;
  created_at: string;
}

export interface Task {
  id: string;
  workstream_id: string;
  title: string;
  notes: string;
  due_date: string | null;
  status: Status;
  position: number;
  today_flag: number;
  today_position: number | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  subtasks: Subtask[];
}

export interface AppState {
  workspaces: Workspace[];
  currentWorkspaceId: string | null;
  workstreams: Workstream[];
  tasks: Task[];
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  picture: string;
}

export const STATUS_LABELS: Record<Status, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
};

export const STATUS_ORDER: Status[] = ['not_started', 'in_progress', 'blocked', 'done'];

export const COLOR_PALETTE = [
  '#EF4444', // red
  '#F97316', // orange
  '#F59E0B', // amber
  '#84CC16', // lime
  '#10B981', // emerald
  '#06B6D4', // cyan
  '#3B82F6', // blue
  '#6366F1', // indigo
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#9CA3AF', // gray
];
