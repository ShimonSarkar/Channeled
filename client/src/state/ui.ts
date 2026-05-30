import { create } from 'zustand';

type Theme = 'light' | 'dark';

export type UndoActionInput =
  | { kind: 'restoreTask'; taskId: string; label: string }
  | { kind: 'patchTask'; taskId: string; patch: Record<string, unknown>; label: string };

export type UndoAction = UndoActionInput & { id: string };

interface UIState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;

  drawerTaskId: string | null;
  openDrawer: (id: string) => void;
  closeDrawer: () => void;

  quickAddOpen: boolean;
  setQuickAdd: (v: boolean) => void;

  undoStack: UndoAction[];
  pushUndo: (a: UndoActionInput) => void;
  popUndo: () => UndoAction | undefined;
  clearUndo: () => void;
}

const stored = (typeof localStorage !== 'undefined' && (localStorage.getItem('theme') as Theme | null)) || null;
const prefersDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
const initialTheme: Theme = stored ?? (prefersDark ? 'dark' : 'light');

export const useUI = create<UIState>((set, get) => ({
  theme: initialTheme,
  setTheme: (t) => {
    localStorage.setItem('theme', t);
    document.documentElement.dataset.theme = t;
    set({ theme: t });
  },
  toggleTheme: () => get().setTheme(get().theme === 'light' ? 'dark' : 'light'),

  drawerTaskId: null,
  openDrawer: (id) => set({ drawerTaskId: id }),
  closeDrawer: () => set({ drawerTaskId: null }),

  quickAddOpen: false,
  setQuickAdd: (v) => set({ quickAddOpen: v }),

  undoStack: [],
  pushUndo: (a) =>
    set((s) => ({
      undoStack: [
        ...s.undoStack.slice(-29),
        { ...a, id: Math.random().toString(36).slice(2) } as UndoAction,
      ],
    })),
  popUndo: () => {
    const stack = get().undoStack;
    if (stack.length === 0) return undefined;
    const last = stack[stack.length - 1];
    set({ undoStack: stack.slice(0, -1) });
    return last;
  },
  clearUndo: () => set({ undoStack: [] }),
}));

// apply initial theme on import
if (typeof document !== 'undefined') {
  document.documentElement.dataset.theme = initialTheme;
}
