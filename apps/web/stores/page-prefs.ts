import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PagePrefs {
  fullWidth?: boolean;
  smallText?: boolean;
}

interface PagePrefsState {
  byPage: Record<string, PagePrefs>;
  toggleFullWidth: (pageId: string) => void;
  toggleSmallText: (pageId: string) => void;
}

/**
 * Per-page layout preferences (full width, small text).
 *
 * These are view settings for the one person using the app, not page content,
 * so they live in localStorage rather than becoming columns on `pages` — no
 * migration, no request on every toggle.
 */
export const usePagePrefsStore = create<PagePrefsState>()(
  persist(
    (set) => ({
      byPage: {},
      toggleFullWidth: (pageId) =>
        set((state) => ({
          byPage: {
            ...state.byPage,
            [pageId]: {
              ...state.byPage[pageId],
              fullWidth: !state.byPage[pageId]?.fullWidth,
            },
          },
        })),
      toggleSmallText: (pageId) =>
        set((state) => ({
          byPage: {
            ...state.byPage,
            [pageId]: {
              ...state.byPage[pageId],
              smallText: !state.byPage[pageId]?.smallText,
            },
          },
        })),
    }),
    { name: 'memoire-page-prefs' },
  ),
);

export function usePagePref(pageId: string): PagePrefs {
  return usePagePrefsStore((s) => s.byPage[pageId]) ?? {};
}
