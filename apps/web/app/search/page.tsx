'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';

export default function SearchPage() {
  const [q, setQ] = useState('');
  const { data: results = [], isFetching } = useQuery({
    queryKey: ['search', q],
    queryFn: () => api.search(q),
    enabled: q.trim().length > 0,
  });

  return (
    <div className="mx-auto max-w-2xl px-8 py-12">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search pages, blocks, databases…"
        className="w-full rounded-lg border border-zinc-200 bg-transparent px-4 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:text-zinc-100"
      />

      <div className="mt-4">
        {q.trim() === '' ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">Type to search.</p>
        ) : isFetching ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">Searching…</p>
        ) : results.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">No results found.</p>
        ) : (
          <ul>
            {results.map((hit) => (
              <li key={`${hit.type}:${hit.pageId}`}>
                <Link
                  href={`/${hit.pageId}`}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] uppercase text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                    {hit.type}
                  </span>
                  {hit.title || 'Untitled'}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
