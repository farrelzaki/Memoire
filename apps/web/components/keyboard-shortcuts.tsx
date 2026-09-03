'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCreatePage } from '@/hooks/use-create-page';
import { useCommandPaletteStore } from '@/stores/command-palette';

const SHORTCUT_GROUPS: Array<{ title: string; entries: Array<[string, string]> }> = [
  {
    title: 'Navigation',
    entries: [
      ['⌘/Ctrl K', 'Open search / command palette'],
      ['⌘/Ctrl P', 'Quick switcher'],
      ['⌘/Ctrl N', 'New page'],
      ['?', 'Show this cheatsheet'],
    ],
  },
  {
    title: 'Editor',
    entries: [
      ['/', 'Open the slash menu'],
      ['⌘/Ctrl B', 'Bold'],
      ['⌘/Ctrl I', 'Italic'],
      ['⌘/Ctrl Shift S', 'Strikethrough'],
      ['⌘/Ctrl E', 'Inline code'],
      ['Esc', 'Close slash menu / block menu'],
    ],
  },
];

/**
 * Global keyboard shortcuts (§27) + the "?" cheatsheet dialog (§15). "?"
 * only fires outside text inputs so it doesn't hijack the literal character
 * while typing.
 */
export function KeyboardShortcuts() {
  const setOpen = useCommandPaletteStore((s) => s.setOpen);
  const createPage = useCreatePage();
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return (
        target.isContentEditable ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'
      );
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase();
        if (key === 'k' || key === 'p') {
          event.preventDefault();
          setOpen(true);
        } else if (key === 'n') {
          event.preventDefault();
          createPage.mutate({});
        }
        return;
      }

      if (event.key === '?' && !isTypingTarget(event.target)) {
        event.preventDefault();
        setCheatsheetOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen, createPage]);

  return (
    <Dialog open={cheatsheetOpen} onOpenChange={setCheatsheetOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Press ? anytime to bring this up again.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {group.title}
              </h3>
              <dl className="space-y-1.5">
                {group.entries.map(([keys, description]) => (
                  <div key={keys} className="flex items-center justify-between gap-3 text-sm">
                    <dt className="text-muted-foreground">{description}</dt>
                    <dd className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {keys}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
