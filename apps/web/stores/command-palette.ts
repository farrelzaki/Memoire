import { create } from 'zustand';

export type CommandPaletteMode = 'command' | 'switcher';

interface CommandPaletteState {
  open: boolean;
  /** `'command'` (Ctrl+K) shows Create/Actions groups; `'switcher'` (Ctrl+P) is page-jump only. */
  mode: CommandPaletteMode;
  setOpen: (open: boolean, mode?: CommandPaletteMode) => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  open: false,
  mode: 'command',
  setOpen: (open, mode = 'command') => set({ open, mode }),
}));
