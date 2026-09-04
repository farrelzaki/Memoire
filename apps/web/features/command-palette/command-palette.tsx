'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { contentTypes } from '@/features/content-types/registry';
import { useCreatePage } from '@/hooks/use-create-page';
import { api } from '@/lib/api';
import { downloadJson } from '@/lib/download';
import { nextTheme } from '@/lib/theme';
import { useCommandPaletteStore } from '@/stores/command-palette';
import { useRecentsStore } from '@/stores/recents';
import { useSidebarStore } from '@/stores/sidebar';
import { useThemeStore } from '@/stores/theme';

const QUICK_SEARCH_DEBOUNCE_MS = 150;

/**
 * `Ctrl+K` command palette / `Ctrl+P` quick switcher (§26, §27, Sprint 23) —
 * migrated onto `components/ui/command.tsx`'s `cmdk` wrapper (previously
 * built but unused). `shouldFilter={false}`: results come from the server
 * (`GET /search`, debounced) rather than cmdk's built-in client-side fuzzy
 * matcher, which would otherwise re-filter an already-ranked result list.
 */
export function CommandPalette() {
  const open = useCommandPaletteStore((s) => s.open);
  const mode = useCommandPaletteStore((s) => s.mode);
  const setOpen = useCommandPaletteStore((s) => s.setOpen);
  const router = useRouter();
  const createPage = useCreatePage();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const toggleSidebar = useSidebarStore((s) => s.toggle);
  const recents = useRecentsStore((s) => s.entries);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedQuery(query), QUICK_SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query]);

  const { data: results = [] } = useQuery({
    queryKey: ['search', 'quick', debouncedQuery, mode],
    queryFn: () => api.search(debouncedQuery, { mode: 'quick', limit: 8 }),
    enabled: open && debouncedQuery.trim().length > 0,
  });

  const runAndClose = (fn: () => void) => {
    fn();
    setOpen(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={(next) => setOpen(next, mode)} shouldFilter={false}>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={mode === 'switcher' ? 'Go to page…' : 'Search pages, or type a command…'}
      />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>

        {query.trim().length === 0 && recents.length > 0 && (
          <CommandGroup heading="Recents">
            {recents.map((entry) => (
              <CommandItem
                key={entry.id}
                value={`recent-${entry.id}`}
                onSelect={() => runAndClose(() => router.push(`/${entry.id}`))}
              >
                <span className="w-4 shrink-0 text-center text-muted-foreground">
                  {entry.icon ?? '📄'}
                </span>
                {entry.title || 'Untitled'}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results.length > 0 && (
          <CommandGroup heading="Search results">
            {results.map((hit) => (
              <CommandItem
                key={`${hit.type}-${hit.pageId}-${hit.blockId ?? ''}-${hit.rowId ?? ''}`}
                value={`result-${hit.pageId}-${hit.blockId ?? ''}-${hit.rowId ?? ''}`}
                onSelect={() =>
                  runAndClose(() => {
                    const anchor = hit.blockId ? `#block-${hit.blockId}` : '';
                    router.push(`/${hit.pageId}${anchor}`);
                  })
                }
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{hit.title || 'Untitled'}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {hit.breadcrumb.join(' / ')}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {mode === 'command' && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Create">
              {Object.values(contentTypes)
                .filter((ct) => ct.createInSidebar)
                .map((ct) => (
                  <CommandItem
                    key={ct.key}
                    value={`create-${ct.key}`}
                    onSelect={() => runAndClose(() => createPage.mutate({ type: ct.key }))}
                  >
                    <span className="w-4 shrink-0 text-center text-muted-foreground">{ct.icon}</span>
                    New {ct.label.toLowerCase()}
                  </CommandItem>
                ))}
            </CommandGroup>

            <CommandSeparator />
            <CommandGroup heading="Actions">
              <CommandItem value="toggle-theme" onSelect={() => setTheme(nextTheme(theme))}>
                Theme: {theme}
              </CommandItem>
              <CommandItem value="toggle-sidebar" onSelect={() => runAndClose(() => toggleSidebar())}>
                Toggle sidebar
              </CommandItem>
              <CommandItem
                value="export-json"
                onSelect={() =>
                  runAndClose(() => {
                    void api.exportWorkspace().then((data) =>
                      downloadJson(`memoire-export-${new Date().toISOString().slice(0, 10)}.json`, data),
                    );
                  })
                }
              >
                Export JSON
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
