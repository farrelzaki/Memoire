import { create } from 'zustand';

interface OfflineState {
  isOnline: boolean;
  pendingCount: number;
  setOnline: (isOnline: boolean) => void;
  setPendingCount: (count: number) => void;
}

/** Read only by the offline banner + sync manager — not persisted, resets each load. */
export const useOfflineStore = create<OfflineState>((set) => ({
  isOnline: true,
  pendingCount: 0,
  setOnline: (isOnline) => set({ isOnline }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
}));
