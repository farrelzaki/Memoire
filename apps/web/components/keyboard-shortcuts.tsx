'use client';

import { useEffect } from 'react';
import { useCreatePage } from '@/hooks/use-create-page';
import { useCommandPaletteStore } from '@/stores/command-palette';

/** Global keyboard shortcuts (§27): Ctrl/Cmd+K palette, Ctrl/Cmd+P switcher, Ctrl/Cmd+N new page. */
export function KeyboardShortcuts() {
  const setOpen = useCommandPaletteStore((s) => s.setOpen);
  const createPage = useCreatePage();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'k' || key === 'p') {
        event.preventDefault();
        setOpen(true);
      } else if (key === 'n') {
        event.preventDefault();
        createPage.mutate({});
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen, createPage]);

  return null;
}
