import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface RecentEntry {
  id: string;
  title: string;
  icon: string | null;
  visitedAt: number;
}

const MAX_RECENTS = 15;

interface RecentsState {
  entries: RecentEntry[];
  record: (page: { id: string; title: string; icon: string | null }) => void;
}

/**
 * Visited-pages history (§16A.3, Sprint 22) — deliberately client-only,
 * localStorage. No backend table, no API endpoint: a page's visit history
 * is presentation convenience, not data worth syncing or backing up.
 */
export const useRecentsStore = create<RecentsState>()(
  persist(
    (set) => ({
      entries: [],
      record: (page) =>
        set((state) => ({
          entries: [
            { id: page.id, title: page.title, icon: page.icon, visitedAt: Date.now() },
            ...state.entries.filter((e) => e.id !== page.id),
          ].slice(0, MAX_RECENTS),
        })),
    }),
    { name: 'memoire-recents' },
  ),
);
