import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Theme } from '@/lib/theme';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'memoire-theme' },
  ),
);
