'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Menu, MenuItem } from '@/components/ui/menu';
import { contentTypes } from '@/features/content-types/registry';
import { TrashDialog } from '@/features/trash/trash-dialog';
import { useCreatePage } from '@/hooks/use-create-page';
import { api } from '@/lib/api';
import { buildPageTree } from '@/lib/pages';
import { useCommandPaletteStore } from '@/stores/command-palette';
import { useSidebarStore } from '@/stores/sidebar';
import { SidebarRow } from './sidebar-row';

/**
 * The workspace sidebar — the app's primary navigation surface.
 *
 * Layout follows the shape a Notion user expects: workspace header, quick
 * actions (search / home), a Favorites section, the page tree, and a pinned
 * footer holding Trash and "New page". The width is user-draggable and
 * persisted (see `stores/sidebar`).
 */
export function Sidebar() {
  const params = useParams<{ pageId?: string }>();
  const activePageId = params?.pageId;

  const createPage = useCreatePage();
  const setPaletteOpen = useCommandPaletteStore((s) => s.setOpen);
  const openPalette = useCallback(() => setPaletteOpen(true), [setPaletteOpen]);

  const collapsed = useSidebarStore((s) => s.collapsed);
  const toggle = useSidebarStore((s) => s.toggle);
  const width = useSidebarStore((s) => s.width);
  const setWidth = useSidebarStore((s) => s.setWidth);

  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);

  const { data: pages = [] } = useQuery({ queryKey: ['pages'], queryFn: api.listPages });

  const active = pages.filter((p) => !p.isArchived);
  const favorites = active.filter((p) => p.isFavorite);
  const trashCount = pages.length - active.length;
  const tree = buildPageTree(active);

  const startResize = useResizeHandle(setWidth);

  if (collapsed) {
    return (
      <aside className="flex h-full w-11 shrink-0 flex-col items-center gap-2 border-r border-zinc-200 bg-zinc-50 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <button
          onClick={toggle}
          title="Expand sidebar"
          className="rounded px-1.5 py-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          »
        </button>
        <button
          onClick={openPalette}
          title="Search"
          className="rounded px-1.5 py-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          🔍
        </button>
      </aside>
    );
  }

  return (
    <>
      <aside
        className="relative flex h-full shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
        style={{ width }}
      >
        <div className="group/side flex items-center justify-between px-3 py-2.5">
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-zinc-900 text-[11px] font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
              M
            </span>
            <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Memoire
            </span>
          </Link>
          <button
            onClick={toggle}
            title="Collapse sidebar"
            className="rounded px-1.5 py-0.5 text-zinc-400 opacity-0 hover:bg-zinc-200 hover:text-zinc-700 group-hover/side:opacity-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            «
          </button>
        </div>

        <nav className="px-2 pb-2">
          <QuickAction icon="🔍" label="Search" onClick={openPalette} hint="⌘K" />
          <QuickAction icon="🏠" label="Home" href="/" />
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {favorites.length > 0 && (
            <Section title="Favorites">
              {favorites.map((page) => (
                <Link
                  key={page.id}
                  href={`/${page.id}`}
                  className={`flex items-center gap-1.5 rounded px-1.5 py-1 text-sm ${
                    page.id === activePageId
                      ? 'bg-zinc-200/70 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                      : 'text-zinc-600 hover:bg-zinc-200/50 dark:text-zinc-300 dark:hover:bg-zinc-800/60'
                  }`}
                >
                  <span className="shrink-0 text-[13px]">{page.icon ?? '📄'}</span>
                  <span className="truncate">{page.title || 'Untitled'}</span>
                </Link>
              ))}
            </Section>
          )}

          <Section
            title="Private"
            action={
              <div className="relative">
                <button
                  onClick={() => setNewMenuOpen((v) => !v)}
                  title="New page"
                  className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-300/60 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                >
                  +
                </button>
                {newMenuOpen && (
                  <Menu onClose={() => setNewMenuOpen(false)} align="right">
                    {Object.values(contentTypes)
                      .filter((ct) => ct.createInSidebar)
                      .map((ct) => (
                        <MenuItem
                          key={ct.key}
                          icon={ct.icon}
                          label={ct.label}
                          onClick={() => {
                            createPage.mutate({ type: ct.key });
                            setNewMenuOpen(false);
                          }}
                        />
                      ))}
                  </Menu>
                )}
              </div>
            }
          >
            {tree.length === 0 ? (
              <p className="px-1.5 py-1 text-sm text-zinc-400 dark:text-zinc-600">
                No pages yet.
              </p>
            ) : (
              tree.map((node) => (
                <SidebarRow
                  key={node.id}
                  node={node}
                  depth={0}
                  activePageId={activePageId}
                />
              ))
            )}
          </Section>
        </div>

        <div className="border-t border-zinc-200 p-2 dark:border-zinc-800">
          <QuickAction
            icon="🗑"
            label="Trash"
            onClick={() => setTrashOpen(true)}
            hint={trashCount > 0 ? String(trashCount) : undefined}
          />
          <QuickAction
            icon="＋"
            label="New page"
            onClick={() => createPage.mutate({ type: 'document' })}
          />
        </div>

        {/* Drag edge — 4px hit area straddling the border. */}
        <div
          onMouseDown={startResize}
          onDoubleClick={() => setWidth(260)}
          title="Drag to resize"
          className="absolute -right-0.5 top-0 z-20 h-full w-1 cursor-col-resize transition-colors hover:bg-blue-400/60"
        />
      </aside>

      {trashOpen && <TrashDialog onClose={() => setTrashOpen(false)} />}
    </>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-3">
      <div className="flex items-center justify-between px-1.5 pb-0.5">
        <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function QuickAction({
  icon,
  label,
  href,
  onClick,
  hint,
}: {
  icon: string;
  label: string;
  href?: string;
  onClick?: () => void;
  hint?: string;
}) {
  const className =
    'flex w-full items-center gap-2 rounded px-1.5 py-1 text-sm text-zinc-600 hover:bg-zinc-200/50 dark:text-zinc-300 dark:hover:bg-zinc-800/60';
  const body = (
    <>
      <span className="w-4 shrink-0 text-center text-[13px]">{icon}</span>
      <span className="flex-1 truncate text-left">{label}</span>
      {hint && <span className="shrink-0 text-xs text-zinc-400">{hint}</span>}
    </>
  );

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}

/**
 * Pointer-driven resize. Listeners live on `window` for the duration of the
 * drag so the pointer can leave the 4px handle without dropping it, and text
 * selection is suppressed so dragging doesn't highlight the page.
 */
function useResizeHandle(setWidth: (width: number) => void) {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (event: MouseEvent) => setWidth(event.clientX);
    const onUp = () => setDragging(false);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    const previousSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = previousSelect;
      document.body.style.cursor = '';
    };
  }, [dragging, setWidth]);

  return useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setDragging(true);
  }, []);
}
