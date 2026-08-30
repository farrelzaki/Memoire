'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCreatePage } from '@/hooks/use-create-page';
import { api } from '@/lib/api';
import { downloadJson } from '@/lib/download';
import { nextTheme } from '@/lib/theme';
import { useCommandPaletteStore } from '@/stores/command-palette';
import { useSidebarStore } from '@/stores/sidebar';
import { useThemeStore } from '@/stores/theme';

interface Item {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette() {
  const open = useCommandPaletteStore((s) => s.open);
  const setOpen = useCommandPaletteStore((s) => s.setOpen);
  const router = useRouter();
  const createPage = useCreatePage();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const toggleSidebar = useSidebarStore((s) => s.toggle);

  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: pages = [] } = useQuery({
    queryKey: ['pages'],
    queryFn: api.listPages,
    enabled: open,
  });

  const items = useMemo<Item[]>(() => {
    const active = pages.filter((p) => !p.isArchived);
    const matched = query
      ? active.filter((p) => p.title.toLowerCase().includes(query.toLowerCase()))
      : [];

    const pageItems: Item[] = matched.map((p) => ({
      id: `page:${p.id}`,
      label: p.title || 'Untitled',
      hint: 'Go to page',
      run: () => {
        router.push(`/${p.id}`);
        setOpen(false);
      },
    }));

    const actionItems: Item[] = [
      {
        id: 'new-page',
        label: 'New page',
        hint: 'Document',
        run: () => {
          createPage.mutate({});
          setOpen(false);
        },
      },
      {
        id: 'new-database',
        label: 'New database',
        hint: 'Database',
        run: () => {
          createPage.mutate({ type: 'database' });
          setOpen(false);
        },
      },
      {
        id: 'toggle-theme',
        label: `Theme: ${theme}`,
        hint: 'Cycle',
        run: () => setTheme(nextTheme(theme)),
      },
      { id: 'toggle-sidebar', label: 'Toggle sidebar', run: () => toggleSidebar() },
      {
        id: 'export-json',
        label: 'Export JSON',
        hint: 'Backup',
        run: () => {
          setOpen(false);
          void api.exportWorkspace().then((data) =>
            downloadJson(`memoire-export-${new Date().toISOString().slice(0, 10)}.json`, data),
          );
        },
      },
    ];

    const filteredActions = query
      ? actionItems.filter((a) => a.label.toLowerCase().includes(query.toLowerCase()))
      : actionItems;

    return [...pageItems, ...filteredActions];
  }, [pages, query, theme, router, createPage, setTheme, toggleSidebar, setOpen]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  if (!open) return null;

  const run = (item: Item) => item.run();

  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (items.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIndex((i) => (i + 1) % items.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIndex((i) => (i - 1 + items.length) % items.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      run(items[index]);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[15vh]"
      onMouseDown={() => setOpen(false)}
    >
      <div
        className="w-[32rem] max-w-[90vw] overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          placeholder="Search pages, or type a command…"
          className="w-full border-b border-zinc-200 bg-transparent px-4 py-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:border-zinc-700 dark:text-zinc-100"
        />
        <div className="max-h-72 overflow-y-auto p-1">
          {items.length === 0 && (
            <p className="px-3 py-2 text-sm text-zinc-400">No results.</p>
          )}
          {items.map((item, i) => (
            <button
              key={item.id}
              onMouseEnter={() => setIndex(i)}
              onClick={() => run(item)}
              className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-200 ${
                i === index ? 'bg-zinc-100 dark:bg-zinc-800' : ''
              }`}
            >
              <span>{item.label}</span>
              {item.hint && <span className="text-xs text-zinc-400">{item.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
