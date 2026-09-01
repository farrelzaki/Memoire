'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useClickOutside } from '@/hooks/use-click-outside';
import { api } from '@/lib/api';
import type { Page } from '@/lib/types';

/**
 * Trash (§32). Archived pages live here until they are restored or explicitly
 * destroyed — permanent delete asks for confirmation in-row, because unlike
 * everything else in the app it cannot be undone.
 */
export function TrashDialog({ onClose }: { onClose: () => void }) {
  const ref = useClickOutside<HTMLDivElement>(onClose);
  const [query, setQuery] = useState('');

  const { data: pages = [], isLoading } = useQuery({
    queryKey: ['pages'],
    queryFn: api.listPages,
  });

  const archived = pages.filter(
    (page) =>
      page.isArchived &&
      (page.title || 'Untitled').toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-24">
      <div
        ref={ref}
        className="flex max-h-[60vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="border-b border-zinc-200 p-3 dark:border-zinc-700">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages in Trash…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-1">
          {isLoading && <p className="p-4 text-sm text-zinc-400">Loading…</p>}
          {!isLoading && archived.length === 0 && (
            <p className="p-4 text-sm text-zinc-400">
              {query ? 'No matching pages in Trash.' : 'Trash is empty.'}
            </p>
          )}
          {archived.map((page) => (
            <TrashRow key={page.id} page={page} />
          ))}
        </div>

        <p className="border-t border-zinc-200 px-4 py-2 text-xs text-zinc-400 dark:border-zinc-700">
          Pages in Trash keep their sub-pages. Deleting permanently removes them too.
        </p>
      </div>
    </div>
  );
}

function TrashRow({ page }: { page: Page }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['pages'] });

  const restore = useMutation({
    mutationFn: () => api.restorePage(page.id),
    onSuccess: invalidate,
  });
  const destroy = useMutation({
    mutationFn: () => api.permanentDeletePage(page.id),
    onSuccess: invalidate,
  });

  return (
    <div className="flex items-center gap-2 rounded px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800">
      <span className="shrink-0">{page.icon ?? '📄'}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-zinc-700 dark:text-zinc-200">
        {page.title || 'Untitled'}
      </span>

      {confirming ? (
        <>
          <span className="shrink-0 text-xs text-zinc-500">Delete forever?</span>
          <button
            onClick={() => destroy.mutate()}
            disabled={destroy.isPending}
            className="shrink-0 rounded px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/40"
          >
            {destroy.isPending ? 'Deleting…' : 'Delete'}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="shrink-0 rounded px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700"
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <button
            onClick={() => restore.mutate()}
            disabled={restore.isPending}
            className="shrink-0 rounded px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-700"
          >
            Restore
          </button>
          <button
            onClick={() => setConfirming(true)}
            className="shrink-0 rounded px-2 py-0.5 text-xs text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
          >
            Delete
          </button>
        </>
      )}
    </div>
  );
}
