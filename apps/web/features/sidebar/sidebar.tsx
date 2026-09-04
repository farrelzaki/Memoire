'use client';

import { DndContext, useDroppable, type DragEndEvent, type DragMoveEvent, type DragStartEvent } from '@dnd-kit/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { contentTypes } from '@/features/content-types/registry';
import { TrashDialog } from '@/features/trash/trash-dialog';
import { useCreatePage } from '@/hooks/use-create-page';
import { api } from '@/lib/api';
import { useDragSensors } from '@/lib/dnd';
import { buildPageTree, flattenVisibleIds, getSubtreeIds } from '@/lib/pages';
import type { Page } from '@/lib/types';
import { useCommandPaletteStore } from '@/stores/command-palette';
import { useRecentsStore } from '@/stores/recents';
import { useSidebarStore } from '@/stores/sidebar';
import { toastWithUndo } from '@/stores/toast';
import { PagePeek } from './page-peek';
import { SidebarRow, type DropZone, type SidebarDragState } from './sidebar-row';

const ROOT_DROPPABLE_ID = '__sidebar_root__';

/** The empty space below the page tree — a drop target for "move to root, at the end." */
function RootDropZone() {
  const { setNodeRef, isOver } = useDroppable({ id: ROOT_DROPPABLE_ID });
  return <div ref={setNodeRef} className={`h-6 ${isOver ? 'rounded bg-zinc-200/50 dark:bg-zinc-800/50' : ''}`} />;
}

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
  const expand = useSidebarStore((s) => s.expand);
  const expandedIds = useSidebarStore((s) => s.expanded);
  const selectedIds = useSidebarStore((s) => s.selectedIds);
  const clearSelection = useSidebarStore((s) => s.clearSelection);

  const [trashOpen, setTrashOpen] = useState(false);
  const [peekPageId, setPeekPageId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { data: pages = [] } = useQuery({ queryKey: ['pages'], queryFn: api.listPages });
  const recents = useRecentsStore((s) => s.entries);

  const active = pages.filter((p) => !p.isArchived);
  const favorites = active.filter((p) => p.isFavorite);
  const trashCount = pages.length - active.length;
  const tree = buildPageTree(active);
  const visibleIds = flattenVisibleIds(tree, expandedIds);

  const startResize = useResizeHandle(setWidth);

  const dragSensors = useDragSensors();
  const [dragState, setDragState] = useState<SidebarDragState>({
    overId: null,
    zone: null,
    disabledIds: new Set(),
  });

  const movePage = useMutation({
    mutationFn: (input: { id: string; parentPageId?: string | null; beforeId?: string | null; afterId?: string | null }) =>
      api.movePage(input.id, { parentPageId: input.parentPageId, beforeId: input.beforeId, afterId: input.afterId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pages'] }),
  });

  const onDragStart = (event: DragStartEvent) => {
    setDragState({ overId: null, zone: null, disabledIds: getSubtreeIds(active, String(event.active.id)) });
  };

  const onDragMove = (event: DragMoveEvent) => {
    const over = event.over;
    if (!over || over.id === ROOT_DROPPABLE_ID) {
      setDragState((s) => ({ ...s, overId: over ? String(over.id) : null, zone: null }));
      return;
    }
    const pointerTop = event.active.rect.current.translated?.top ?? over.rect.top;
    const relativeY = (pointerTop - over.rect.top) / over.rect.height;
    const zone: DropZone = relativeY < 0.25 ? 'before' : relativeY > 0.75 ? 'after' : 'into';
    setDragState((s) => ({ ...s, overId: String(over.id), zone }));
  };

  const onDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const over = event.over;
    const zone = dragState.zone;
    setDragState({ overId: null, zone: null, disabledIds: new Set() });
    if (!over) return;

    if (over.id === ROOT_DROPPABLE_ID) {
      const rootSiblingIds = tree.map((n) => n.id).filter((id) => id !== activeId);
      const lastId = rootSiblingIds[rootSiblingIds.length - 1] ?? null;
      movePage.mutate({ id: activeId, parentPageId: null, beforeId: lastId, afterId: null });
      return;
    }

    const overId = String(over.id);
    if (overId === activeId) return;
    const overPage = active.find((p) => p.id === overId);
    if (!overPage) return;

    if (zone === 'into') {
      movePage.mutate({ id: activeId, parentPageId: overId });
      expand(overId);
      return;
    }

    // "before"/"after" — drop as a sibling of `overPage`, under *its* parent
    // (may differ from activeId's current parent — a reparent-with-position).
    // Not `neighborsAfterDrag` here: that helper assumes `activeId` is
    // already a member of the list (flat-list reorder); here it commonly
    // isn't (cross-parent move), so anchors are computed directly against
    // `overId`'s neighbors with `activeId` excluded.
    const siblingIds = active
      .filter((p) => p.parentPageId === overPage.parentPageId && p.id !== activeId)
      .sort((a, b) => a.position - b.position)
      .map((p) => p.id);
    const overIndex = siblingIds.indexOf(overId);
    const beforeId = zone === 'before' ? (overIndex > 0 ? siblingIds[overIndex - 1] : null) : overId;
    const afterId = zone === 'before' ? overId : overIndex < siblingIds.length - 1 ? siblingIds[overIndex + 1] : null;
    movePage.mutate({ id: activeId, parentPageId: overPage.parentPageId, beforeId, afterId });
  };

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

          {recents.length > 0 && (
            <Section title="Recents">
              {recents.map((entry) => (
                <Link
                  key={entry.id}
                  href={`/${entry.id}`}
                  className={`flex items-center gap-1.5 rounded px-1.5 py-1 text-sm ${
                    entry.id === activePageId
                      ? 'bg-zinc-200/70 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                      : 'text-zinc-600 hover:bg-zinc-200/50 dark:text-zinc-300 dark:hover:bg-zinc-800/60'
                  }`}
                >
                  <span className="shrink-0 text-[13px]">{entry.icon ?? '📄'}</span>
                  <span className="truncate">{entry.title || 'Untitled'}</span>
                </Link>
              ))}
            </Section>
          )}

          <Section
            title="Private"
            action={
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    title="New page"
                    className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-300/60 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                  >
                    +
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {Object.values(contentTypes)
                    .filter((ct) => ct.createInSidebar)
                    .map((ct) => (
                      <DropdownMenuItem
                        key={ct.key}
                        onClick={() => createPage.mutate({ type: ct.key })}
                      >
                        <span className="w-4 shrink-0 text-center text-zinc-400">{ct.icon}</span>
                        {ct.label}
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            }
          >
            {tree.length === 0 ? (
              <p className="px-1.5 py-1 text-sm text-zinc-400 dark:text-zinc-600">
                No pages yet.
              </p>
            ) : (
              <DndContext sensors={dragSensors} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd}>
                {tree.map((node) => (
                  <SidebarRow
                    key={node.id}
                    node={node}
                    depth={0}
                    activePageId={activePageId}
                    dragState={dragState}
                    visibleIds={visibleIds}
                    onPeek={setPeekPageId}
                  />
                ))}
                <RootDropZone />
              </DndContext>
            )}
          </Section>
        </div>

        {selectedIds.length > 0 ? (
          <BulkActionBar selectedIds={selectedIds} pages={active} onClear={clearSelection} />
        ) : (
          <div className="border-t border-zinc-200 p-2 dark:border-zinc-800">
            <QuickAction
              icon="🗑"
              label="Trash"
              onClick={() => setTrashOpen(true)}
              hint={trashCount > 0 ? String(trashCount) : undefined}
            />
            <QuickAction icon="⚙" label="Settings" href="/settings" />
            <QuickAction
              icon="＋"
              label="New page"
              onClick={() => createPage.mutate({ type: 'document' })}
            />
          </div>
        )}

        {/* Drag edge — 4px hit area straddling the border. */}
        <div
          onMouseDown={startResize}
          onDoubleClick={() => setWidth(260)}
          title="Drag to resize"
          className="absolute -right-0.5 top-0 z-20 h-full w-1 cursor-col-resize transition-colors hover:bg-blue-400/60"
        />
      </aside>

      {trashOpen && <TrashDialog onClose={() => setTrashOpen(false)} />}
      {peekPageId && <PagePeek pageId={peekPageId} onClose={() => setPeekPageId(null)} />}
    </>
  );
}

/**
 * Replaces the Trash/New-page footer while rows are multi-selected (§22.6,
 * Sprint 22). "Export" is deliberately not offered here — no export
 * mechanism exists anywhere yet to hook into; that's Sprint 24's job, and
 * building a one-off path now would be scope creep ahead of that sprint's
 * real design.
 */
function BulkActionBar({
  selectedIds,
  pages,
  onClear,
}: {
  selectedIds: string[];
  pages: Page[];
  onClear: () => void;
}) {
  const router = useRouter();
  const params = useParams<{ pageId?: string }>();
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['pages'] });

  const favorite = useMutation({
    mutationFn: () => Promise.all(selectedIds.map((id) => api.updatePage(id, { isFavorite: true }))),
    onSuccess: () => {
      invalidate();
      onClear();
    },
  });

  const archive = useMutation({
    mutationFn: () => Promise.all(selectedIds.map((id) => api.archivePage(id))),
    onSuccess: () => {
      invalidate();
      if (params?.pageId && selectedIds.includes(params.pageId)) router.push('/');
      toastWithUndo(`${selectedIds.length} pages moved to Trash`, () => {
        Promise.all(selectedIds.map((id) => api.restorePage(id))).then(invalidate);
      });
      onClear();
    },
  });

  const excluded = new Set<string>();
  for (const id of selectedIds) for (const sub of getSubtreeIds(pages, id)) excluded.add(sub);
  const targets = pages.filter((p) => !excluded.has(p.id));

  const bulkMove = useMutation({
    mutationFn: (parentPageId: string | null) =>
      Promise.all(selectedIds.map((id) => api.movePage(id, { parentPageId }))),
    onSuccess: () => {
      invalidate();
      onClear();
    },
  });

  return (
    <div className="flex items-center gap-1 border-t border-zinc-200 p-2 dark:border-zinc-800">
      <span className="flex-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
        {selectedIds.length} selected
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="Move to…"
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-300/60 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
          >
            →
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
          <DropdownMenuLabel>Move to</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => bulkMove.mutate(null)}>
            <span className="w-4 shrink-0 text-center text-zinc-400">🏠</span>
            Workspace (top level)
          </DropdownMenuItem>
          {targets.map((target) => (
            <DropdownMenuItem key={target.id} onClick={() => bulkMove.mutate(target.id)}>
              <span className="w-4 shrink-0 text-center text-zinc-400">{target.icon ?? '📄'}</span>
              {target.title || 'Untitled'}
            </DropdownMenuItem>
          ))}
          {targets.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-zinc-400">No other pages.</p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        type="button"
        title="Add to Favorites"
        onClick={() => favorite.mutate()}
        className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-300/60 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
      >
        ☆
      </button>
      <button
        type="button"
        title="Move to Trash"
        onClick={() => archive.mutate()}
        className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-300/60 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
      >
        🗑
      </button>
      <button
        type="button"
        title="Clear selection"
        onClick={onClear}
        className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-300/60 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
      >
        ✕
      </button>
    </div>
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
