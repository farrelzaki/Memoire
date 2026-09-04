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
  /** Multi-selected row ids (§22.6, Sprint 22) — presentation state, never persisted. */
  selectedIds: string[];
  /** Shift-click range anchor. */
  lastSelectedId: string | null;
  toggle: () => void;
  setWidth: (width: number) => void;
  toggleExpanded: (pageId: string) => void;
  expand: (pageId: string) => void;
  selectOne: (pageId: string) => void;
  toggleSelect: (pageId: string) => void;
  selectRange: (visibleIds: string[], pageId: string) => void;
  clearSelection: () => void;
}

export function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
}

/**
 * Persisted so the sidebar keeps its width and open sections across reloads,
 * which is what makes the tree feel like a stable navigation surface rather
 * than something that resets every visit. `selectedIds`/`lastSelectedId` are
 * excluded via `partialize` — a stale multi-select surviving a reload would
 * be confusing, since it isn't visible anywhere until you look for it.
 */
export const useSidebarStore = create<SidebarState>()(
  persist(
    (set, get) => ({
      collapsed: false,
      width: SIDEBAR_DEFAULT_WIDTH,
      expanded: [],
      selectedIds: [],
      lastSelectedId: null,
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
      selectOne: (pageId) => set({ selectedIds: [pageId], lastSelectedId: pageId }),
      toggleSelect: (pageId) =>
        set((state) => {
          const selectedIds = state.selectedIds.includes(pageId)
            ? state.selectedIds.filter((id) => id !== pageId)
            : [...state.selectedIds, pageId];
          return { selectedIds, lastSelectedId: pageId };
        }),
      selectRange: (visibleIds, pageId) => {
        const anchor = get().lastSelectedId ?? pageId;
        const anchorIndex = visibleIds.indexOf(anchor);
        const targetIndex = visibleIds.indexOf(pageId);
        if (anchorIndex === -1 || targetIndex === -1) {
          set({ selectedIds: [pageId], lastSelectedId: pageId });
          return;
        }
        const [start, end] = anchorIndex <= targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
        set({ selectedIds: visibleIds.slice(start, end + 1), lastSelectedId: pageId });
      },
      clearSelection: () => set({ selectedIds: [], lastSelectedId: null }),
    }),
    {
      name: 'memoire-sidebar',
      partialize: (state) => ({ collapsed: state.collapsed, width: state.width, expanded: state.expanded }),
    },
  ),
);
