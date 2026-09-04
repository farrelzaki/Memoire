import { create } from 'zustand';

interface NavigationHistoryState {
  stack: string[];
  cursor: number;
  push: (pageId: string) => void;
  back: () => string | null;
  forward: () => string | null;
  canBack: () => boolean;
  canForward: () => boolean;
}

/**
 * Topbar back/forward (§16A.4, Sprint 22) — an app-owned navigation stack,
 * separate from and not coupled to the browser's own history/`popstate`.
 * Next.js App Router's browser back/forward already works correctly on its
 * own; this is framed as an additional affordance next to the breadcrumb,
 * not a fix, so keeping the two systems independent avoids fighting the
 * router's internals for double-tracked state. In-memory only (not
 * persisted) — a fresh tab starting a new stack is expected.
 */
export const useNavigationHistoryStore = create<NavigationHistoryState>()((set, get) => ({
  stack: [],
  cursor: -1,

  push: (pageId) =>
    set((state) => {
      if (state.stack[state.cursor] === pageId) return state; // no-op re-visit of the current page
      // Pushing after having gone back drops the "future" tail — standard
      // back/forward-stack semantics.
      const stack = [...state.stack.slice(0, state.cursor + 1), pageId];
      return { stack, cursor: stack.length - 1 };
    }),

  back: () => {
    const { stack, cursor } = get();
    if (cursor <= 0) return null;
    set({ cursor: cursor - 1 });
    return stack[cursor - 1];
  },

  forward: () => {
    const { stack, cursor } = get();
    if (cursor >= stack.length - 1) return null;
    set({ cursor: cursor + 1 });
    return stack[cursor + 1];
  },

  canBack: () => get().cursor > 0,
  canForward: () => get().cursor < get().stack.length - 1,
}));
