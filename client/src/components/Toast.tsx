import { create } from 'zustand';

export interface Toast {
  id: string;
  message: string;
  kind?: 'info' | 'error';
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, kind?: 'info' | 'error') => void;
  remove: (id: string) => void;
}

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (message, kind = 'info') => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3200);
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function ToastHost() {
  const { toasts, remove } = useToasts();
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`} onClick={() => remove(t.id)}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
