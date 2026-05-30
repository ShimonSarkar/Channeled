import { z } from 'zod';

export const STATUSES = ['not_started', 'in_progress', 'blocked', 'done'] as const;

export const subtaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(300),
  done: z.boolean(),
});

export const createWorkstreamSchema = z.object({
  name: z.string().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  notes: z.string().max(20000).optional(),
});

export const updateWorkstreamSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  notes: z.string().max(20000).optional(),
});

export const reorderSchema = z.object({
  orderedIds: z.array(z.string().min(1)),
});

export const createTaskSchema = z.object({
  workstreamId: z.string().min(1).optional(),
  title: z.string().min(1).max(300),
  notes: z.string().max(20000).optional(),
  dueDate: z.string().nullable().optional(),
  status: z.enum(STATUSES).optional(),
  today: z.boolean().optional(),
  subtasks: z.array(subtaskSchema).optional(),
});

export const updateTaskSchema = z.object({
  workstreamId: z.string().min(1).optional(),
  title: z.string().min(1).max(300).optional(),
  notes: z.string().max(20000).optional(),
  dueDate: z.string().nullable().optional(),
  status: z.enum(STATUSES).optional(),
  today: z.boolean().optional(),
  completed: z.boolean().optional(),
  subtasks: z.array(subtaskSchema).optional(),
});

export const reorderTasksSchema = z.object({
  scope: z.enum(['workstream', 'today']),
  workstreamId: z.string().min(1).optional(),
  orderedIds: z.array(z.string().min(1)),
});
