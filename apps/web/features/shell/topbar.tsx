'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api } from '@/lib/api';
import { getBreadcrumbTrail, getSiblings } from '@/lib/pages';
import type { Page } from '@/lib/types';
import { useNavigationHistoryStore } from '@/stores/navigation-history';
import { useSidebarStore } from '@/stores/sidebar';
import { PageMenu } from './page-menu';

/**
 * Sticky page topbar: back/forward, breadcrumb trail (each crumb has a
 * sibling-jump dropdown), and page actions on the right. This is the bar
 * that tells you where you are in the hierarchy — without it a nested page
 * gives no clue what it belongs to.
 */
export function Topbar({ page }: { page: Page }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const collapsed = useSidebarStore((s) => s.collapsed);
  const toggleSidebar = useSidebarStore((s) => s.toggle);

  const back = useNavigationHistoryStore((s) => s.back);
  const forward = useNavigationHistoryStore((s) => s.forward);
  const canBack = useNavigationHistoryStore((s) => s.canBack());
  const canForward = useNavigationHistoryStore((s) => s.canForward());

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

      <div className="flex shrink-0 items-center gap-0.5">
        <button
          onClick={() => {
            const id = back();
            if (id) router.push(`/${id}`);
          }}
          disabled={!canBack}
          title="Back"
          className="rounded px-1.5 py-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          ‹
        </button>
        <button
          onClick={() => {
            const id = forward();
            if (id) router.push(`/${id}`);
          }}
          disabled={!canForward}
          title="Forward"
          className="rounded px-1.5 py-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          ›
        </button>
      </div>

      <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-sm">
        {trail.map((crumb, index) => {
          const siblings = getSiblings(pages, crumb);
          return (
            <Fragment key={crumb.id}>
              {index > 0 && <span className="shrink-0 text-zinc-300 dark:text-zinc-600">/</span>}
              <span className="flex min-w-0 shrink items-center">
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
                {siblings.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        title="Jump to a sibling page"
                        className="shrink-0 rounded px-0.5 py-0.5 text-xs text-zinc-300 hover:bg-zinc-100 hover:text-zinc-600 dark:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                      >
                        ▾
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
                      {siblings.map((sibling) => (
                        <DropdownMenuItem key={sibling.id} onClick={() => router.push(`/${sibling.id}`)}>
                          <span className="w-4 shrink-0 text-center text-zinc-400">
                            {sibling.icon ?? '📄'}
                          </span>
                          {sibling.title || 'Untitled'}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </span>
            </Fragment>
          );
        })}
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
