import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const SIDEBAR_MIN_WIDTH = 180;
export const SIDEBAR_MAX_WIDTH = 480;
export const SIDEBAR_DEFAULT_WIDTH = 260;

interface SidebarState {
  collapsed: boolean;
  width: number;
  /** Ids of page rows whose children are expanded in the tree. */
  expanded: string[];
  toggle: () => void;
  setWidth: (width: number) => void;
  toggleExpanded: (pageId: string) => void;
  expand: (pageId: string) => void;
}

export function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
}

/**
 * Persisted so the sidebar keeps its width and open sections across reloads,
 * which is what makes the tree feel like a stable navigation surface rather
 * than something that resets every visit.
 */
export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      collapsed: false,
      width: SIDEBAR_DEFAULT_WIDTH,
      expanded: [],
      toggle: () => set((state) => ({ collapsed: !state.collapsed })),
      setWidth: (width) => set({ width: clampSidebarWidth(width) }),
      toggleExpanded: (pageId) =>
        set((state) => ({
          expanded: state.expanded.includes(pageId)
            ? state.expanded.filter((id) => id !== pageId)
            : [...state.expanded, pageId],
        })),
      expand: (pageId) =>
        set((state) =>
          state.expanded.includes(pageId)
            ? state
            : { expanded: [...state.expanded, pageId] },
        ),
    }),
    { name: 'memoire-sidebar' },
  ),
);
