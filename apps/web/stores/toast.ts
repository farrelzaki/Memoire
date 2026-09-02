import { create } from 'zustand';

export interface ToastEntry {
  id: string;
  title?: string;
  description?: string;
  variant?: 'default' | 'destructive';
  /** Label + handler for an inline action button — used by the "Urungkan" (undo) snackbar. */
  action?: { label: string; onClick: () => void };
}

interface ToastState {
  toasts: ToastEntry[];
  show: (toast: Omit<ToastEntry, 'id'>) => string;
  dismiss: (id: string) => void;
}

let seq = 0;
function nextId(): string {
  seq += 1;
  return `toast-${seq}`;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: (toast) => {
    const id = nextId();
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

/** Convenience wrapper — `toast({ title, description })` from anywhere, no hook needed. */
export function toast(entry: Omit<ToastEntry, 'id'>): string {
  return useToastStore.getState().show(entry);
}

/**
 * The "Urungkan" pattern: perform an action immediately, but surface a toast
 * with an Undo button that reverses it if clicked before it's dismissed.
 * Used for destructive-but-recoverable actions (archive, delete) so the user
 * isn't blocked by a confirm dialog for something they can just undo.
 */
export function toastWithUndo(
  description: string,
  onUndo: () => void,
  opts: { title?: string } = {},
): string {
  return toast({
    title: opts.title,
    description,
    action: { label: 'Urungkan', onClick: onUndo },
  });
}
