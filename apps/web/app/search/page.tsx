'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { api } from '@/lib/api';
import { parseSnippet } from '@/lib/search';
import type { SearchQueryParams } from '@/lib/types';

const TYPE_OPTIONS: Array<{ value: NonNullable<SearchQueryParams['type']>; label: string }> = [
  { value: 'document', label: 'Document' },
  { value: 'database', label: 'Database' },
  { value: 'whiteboard', label: 'Whiteboard' },
  { value: 'diagram', label: 'Diagram' },
];

const TIME_RANGE_OPTIONS: Array<{ value: NonNullable<SearchQueryParams['timeRange']>; label: string }> = [
  { value: '7d', label: 'Past 7 days' },
  { value: '30d', label: 'Past 30 days' },
  { value: 'year', label: 'Past year' },
];

const SORT_OPTIONS: Array<{ value: NonNullable<SearchQueryParams['sort']>; label: string }> = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'updated', label: 'Last modified' },
];

/**
 * Filtered/browsable search results (§25A) — the destination for a
 * deliberate, complete query with type/time-range/sort narrowing, as
 * distinct from the command palette's quick-jump (§26, 8 results, no
 * filters). Filters live in the URL (`useSearchParams`) so a filtered search
 * is shareable/bookmarkable, not component state that resets on navigation.
 */
export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchPageContent />
    </Suspense>
  );
}

function SearchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const q = searchParams.get('q') ?? '';
  const type = (searchParams.get('type') as SearchQueryParams['type']) ?? undefined;
  const timeRange = (searchParams.get('timeRange') as SearchQueryParams['timeRange']) ?? undefined;
  const sort = (searchParams.get('sort') as SearchQueryParams['sort']) ?? 'relevance';

  const setParam = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`/search?${next.toString()}`);
  };

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['search', 'full', q, type, timeRange, sort],
    queryFn: () => api.search(q, { mode: 'full', type, timeRange, sort, limit: 50 }),
    enabled: q.trim().length > 0,
  });

  return (
    <div className="mx-auto max-w-2xl px-8 py-12">
      <input
        autoFocus
        defaultValue={q}
        onChange={(e) => setParam('q', e.target.value || undefined)}
        placeholder="Search pages, blocks, databases…"
        className="w-full rounded-lg border border-zinc-200 bg-transparent px-4 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:text-zinc-100"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <select
          value={type ?? ''}
          onChange={(e) => setParam('type', e.target.value || undefined)}
          className="rounded border border-zinc-200 bg-transparent px-2 py-1 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
        >
          <option value="">All types</option>
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={timeRange ?? ''}
          onChange={(e) => setParam('timeRange', e.target.value || undefined)}
          className="rounded border border-zinc-200 bg-transparent px-2 py-1 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
        >
          <option value="">Any time</option>
          {TIME_RANGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={sort}
          onChange={(e) => setParam('sort', e.target.value)}
          className="rounded border border-zinc-200 bg-transparent px-2 py-1 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4">
        {q.trim() === '' ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">Type to search.</p>
        ) : isFetching ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">Searching…</p>
        ) : results.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">No results found.</p>
        ) : (
          <ul className="space-y-1">
            {results.map((hit) => (
              <li key={`${hit.type}:${hit.pageId}:${hit.blockId ?? ''}:${hit.rowId ?? ''}`}>
                <Link
                  href={`/${hit.pageId}${hit.blockId ? `#block-${hit.blockId}` : ''}`}
                  className="flex flex-col gap-0.5 rounded px-2 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] uppercase text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                      {hit.type}
                    </span>
                    <span className="font-medium">{hit.title || 'Untitled'}</span>
                  </div>
                  {hit.breadcrumb.length > 1 && (
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                      {hit.breadcrumb.join(' / ')}
                    </span>
                  )}
                  {hit.snippet && (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {parseSnippet(hit.snippet).map((segment, i) =>
                        segment.matched ? (
                          <mark key={i} className="rounded bg-yellow-200 px-0.5 dark:bg-yellow-900">
                            {segment.text}
                          </mark>
                        ) : (
                          <span key={i}>{segment.text}</span>
                        ),
                      )}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
