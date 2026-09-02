'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Fragment } from 'react';
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { api } from '@/lib/api';
import { getBreadcrumbTrail } from '@/lib/pages';
import type { Page } from '@/lib/types';
import { useSidebarStore } from '@/stores/sidebar';
import { PageMenu } from './page-menu';

/**
 * Sticky page topbar: breadcrumb trail on the left, page actions on the right.
 * This is the bar that tells you where you are in the hierarchy — without it a
 * nested page gives no clue what it belongs to.
 */
export function Topbar({ page }: { page: Page }) {
  const queryClient = useQueryClient();
  const collapsed = useSidebarStore((s) => s.collapsed);
  const toggleSidebar = useSidebarStore((s) => s.toggle);

  const { data: pages = [] } = useQuery({ queryKey: ['pages'], queryFn: api.listPages });
  const trail = getBreadcrumbTrail(pages, page.id);

  const favorite = useMutation({
    mutationFn: () => api.updatePage(page.id, { isFavorite: !page.isFavorite }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pages'] });
      queryClient.invalidateQueries({ queryKey: ['page', page.id] });
    },
  });

  return (
    <div className="sticky top-0 z-30 flex h-11 items-center gap-2 border-b border-zinc-200/70 bg-white/80 px-3 backdrop-blur dark:border-zinc-800/70 dark:bg-zinc-950/80">
      {collapsed && (
        <button
          onClick={toggleSidebar}
          className="rounded px-1.5 py-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          title="Expand sidebar"
        >
          »
        </button>
      )}

      <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-sm">
        {trail.map((crumb, index) => (
          <Fragment key={crumb.id}>
            {index > 0 && <span className="shrink-0 text-zinc-300 dark:text-zinc-600">/</span>}
            <Link
              href={`/${crumb.id}`}
              className={`flex min-w-0 items-center gap-1 truncate rounded px-1.5 py-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                index === trail.length - 1
                  ? 'text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              {crumb.icon && <span className="shrink-0">{crumb.icon}</span>}
              <span className="truncate">{crumb.title || 'Untitled'}</span>
            </Link>
          </Fragment>
        ))}
      </nav>

      <div className="flex shrink-0 items-center gap-0.5">
        <button
          onClick={() => favorite.mutate()}
          title={page.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
          className={`rounded px-1.5 py-0.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
            page.isFavorite ? 'text-amber-500' : 'text-zinc-400'
          }`}
        >
          {page.isFavorite ? '★' : '☆'}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              title="Page options"
              className="rounded px-1.5 py-0.5 text-sm text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              ⋯
            </button>
          </DropdownMenuTrigger>
          <PageMenu page={page} />
        </DropdownMenu>
      </div>
    </div>
  );
}
