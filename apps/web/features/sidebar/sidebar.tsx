'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { useCreatePage } from '@/hooks/use-create-page';
import { api } from '@/lib/api';
import { buildPageTree, type PageTreeNode } from '@/lib/pages';
import type { Page } from '@/lib/types';

function TreeNodes({ nodes, depth = 0 }: { nodes: PageTreeNode[]; depth?: number }) {
  return (
    <ul>
      {nodes.map((node) => (
        <li key={node.id}>
          <Link
            href={`/${node.id}`}
            className="block truncate rounded px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-200"
            style={{ paddingLeft: 8 + depth * 16 }}
          >
            {node.title || 'Untitled'}
          </Link>
          {node.children.length > 0 && <TreeNodes nodes={node.children} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  );
}

function TrashRow({ page }: { page: Page }) {
  const queryClient = useQueryClient();
  const restore = useMutation({
    mutationFn: () => api.restorePage(page.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pages'] }),
  });

  return (
    <li className="flex items-center justify-between gap-2 rounded px-2 py-1">
      <span className="truncate text-sm text-zinc-500">{page.title || 'Untitled'}</span>
      <button
        onClick={() => restore.mutate()}
        className="shrink-0 text-xs text-zinc-400 hover:text-zinc-700"
      >
        Restore
      </button>
    </li>
  );
}

export function Sidebar() {
  const createPage = useCreatePage();
  const [menuOpen, setMenuOpen] = useState(false);

  const { data: pages = [] } = useQuery({ queryKey: ['pages'], queryFn: api.listPages });

  const active = pages.filter((p) => !p.isArchived);
  const archived = pages.filter((p) => p.isArchived);
  const favorites = active.filter((p) => p.isFavorite);
  const tree = buildPageTree(active);

  return (
    <aside className="flex h-full w-64 flex-col gap-4 overflow-y-auto border-r border-zinc-200 bg-zinc-50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-zinc-900">Memoire</span>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded px-2 py-0.5 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900"
            title="New page"
          >
            + New
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-8 z-50 w-40 rounded border border-zinc-200 bg-white p-1 shadow-lg">
              <button
                onClick={() => {
                  createPage.mutate({});
                  setMenuOpen(false);
                }}
                className="block w-full rounded px-2 py-1 text-left text-sm text-zinc-700 hover:bg-zinc-100"
              >
                Page
              </button>
              <button
                onClick={() => {
                  createPage.mutate({ type: 'database' });
                  setMenuOpen(false);
                }}
                className="block w-full rounded px-2 py-1 text-left text-sm text-zinc-700 hover:bg-zinc-100"
              >
                Database
              </button>
            </div>
          )}
        </div>
      </div>

      {favorites.length > 0 && (
        <section>
          <h2 className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
            Favorites
          </h2>
          <ul>
            {favorites.map((page) => (
              <li key={page.id}>
                <Link
                  href={`/${page.id}`}
                  className="block truncate rounded px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-200"
                >
                  {page.title || 'Untitled'}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
          Pages
        </h2>
        {tree.length === 0 ? (
          <p className="px-2 text-sm text-zinc-400">No pages yet.</p>
        ) : (
          <TreeNodes nodes={tree} />
        )}
      </section>

      {archived.length > 0 && (
        <section>
          <h2 className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
            Trash
          </h2>
          <ul>
            {archived.map((page) => (
              <TrashRow key={page.id} page={page} />
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
