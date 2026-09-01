'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { contentTypes } from '@/features/content-types/registry';
import { useCreatePage } from '@/hooks/use-create-page';
import { api } from '@/lib/api';
import { coverStyle } from '@/lib/cover';
import type { Page } from '@/lib/types';

/**
 * Workspace home — the landing surface when no page is open. Mirrors Notion's
 * home: a time-of-day greeting, recently edited pages as cards, and one row
 * for starting something new.
 */
export default function Home() {
  const createPage = useCreatePage();
  const { data: pages = [], isLoading } = useQuery({
    queryKey: ['pages'],
    queryFn: api.listPages,
  });

  const recent = pages
    .filter((page) => !page.isArchived)
    .slice()
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 8);

  return (
    <div className="mx-auto max-w-4xl px-8 py-16">
      <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">{greeting()}</h1>

      <section className="mt-10">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400">
          Recently edited
        </h2>
        {isLoading && <p className="text-sm text-zinc-400">Loading…</p>}
        {!isLoading && recent.length === 0 && (
          <p className="text-sm text-zinc-400">
            Nothing yet — create your first page below.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {recent.map((page) => (
            <RecentCard key={page.id} page={page} />
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400">
          Start new
        </h2>
        <div className="flex flex-wrap gap-2">
          {Object.values(contentTypes)
            .filter((ct) => ct.createInSidebar)
            .map((ct) => (
              <button
                key={ct.key}
                onClick={() => createPage.mutate({ type: ct.key })}
                className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/60"
              >
                <span>{ct.icon}</span>
                <span>{ct.label}</span>
              </button>
            ))}
        </div>
      </section>
    </div>
  );
}

function RecentCard({ page }: { page: Page }) {
  return (
    <Link
      href={`/${page.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-zinc-200 transition hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:hover:border-zinc-700"
    >
      <div
        className="h-16 w-full bg-zinc-100 dark:bg-zinc-800"
        style={page.coverUrl ? coverStyle(page.coverUrl) : undefined}
      />
      <div className="flex min-w-0 items-center gap-1.5 px-3 py-2.5">
        <span className="shrink-0 text-sm">{page.icon ?? '📄'}</span>
        <span className="truncate text-sm font-medium text-zinc-700 dark:text-zinc-200">
          {page.title || 'Untitled'}
        </span>
      </div>
    </Link>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
