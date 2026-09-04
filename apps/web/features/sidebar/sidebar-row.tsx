'use client';

import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PAGE_DRAG_MIME_TYPE } from '@/features/editor/link-to-page-drop-plugin';
import { MoveToItems } from '@/features/shell/page-menu';
import { api } from '@/lib/api';
import type { PageTreeNode } from '@/lib/pages';
import { useSidebarStore } from '@/stores/sidebar';
import { toastWithUndo } from '@/stores/toast';

export type DropZone = 'before' | 'after' | 'into';

/** The sidebar's current drag hover state, computed once in `Sidebar`'s `DndContext` and threaded down. */
export interface SidebarDragState {
  overId: string | null;
  zone: DropZone | null;
  disabledIds: Set<string>;
}

/**
 * One page row in the sidebar tree: disclosure chevron, icon, title, and the
 * hover-only `⋯` / `+` actions. Rows nest by indenting their padding rather
 * than by nesting containers, so a deep tree still aligns its hover targets
 * on one vertical edge.
 */
export function SidebarRow({
  node,
  depth,
  activePageId,
  dragState,
  visibleIds,
  onPeek,
}: {
  node: PageTreeNode;
  depth: number;
  activePageId?: string;
  /** Omit to render without drag support (e.g. Favorites, which isn't reorderable here). */
  dragState?: SidebarDragState;
  /** Root-first, depth-first ids of every rendered row — the shift-click range order. Omit to disable multi-select. */
  visibleIds?: string[];
  /** Opens the read-only page peek modal for this row (§22.8, Sprint 22). */
  onPeek?: (pageId: string) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [renaming, setRenaming] = useState(false);

  const expandedIds = useSidebarStore((s) => s.expanded);
  const toggleExpanded = useSidebarStore((s) => s.toggleExpanded);
  const expand = useSidebarStore((s) => s.expand);
  const selectedIds = useSidebarStore((s) => s.selectedIds);
  const selectOne = useSidebarStore((s) => s.selectOne);
  const toggleSelect = useSidebarStore((s) => s.toggleSelect);
  const selectRange = useSidebarStore((s) => s.selectRange);
  const clearSelection = useSidebarStore((s) => s.clearSelection);

  const isExpanded = expandedIds.includes(node.id);
  const isActive = node.id === activePageId;
  const isSelected = selectedIds.includes(node.id);
  const hasChildren = node.children.length > 0;

  const handleRowClick = (e: React.MouseEvent) => {
    if (!visibleIds) return;
    if (e.shiftKey) {
      e.preventDefault();
      selectRange(visibleIds, node.id);
    } else if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      toggleSelect(node.id);
    } else if (selectedIds.length > 0) {
      // A selection is active — a plain click clears it instead of navigating,
      // matching Notion (the second click is "deselect", not "open").
      e.preventDefault();
      clearSelection();
    }
  };

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: node.id });
  const { setNodeRef: setDropRef } = useDroppable({
    id: node.id,
    disabled: dragState?.disabledIds.has(node.id) ?? false,
  });
  const isDropTarget = dragState?.overId === node.id;
  const dropZone = isDropTarget ? dragState?.zone : null;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['pages'] });

  const addSubpage = useMutation({
    mutationFn: () => api.createPage({ parentPageId: node.id, type: 'document' }),
    onSuccess: (page) => {
      invalidate();
      expand(node.id);
      router.push(`/${page.id}`);
    },
  });

  const duplicate = useMutation({
    mutationFn: () => api.duplicatePage(node.id),
    onSuccess: (copy) => {
      invalidate();
      router.push(`/${copy.id}`);
    },
  });

  const archive = useMutation({
    mutationFn: () => api.archivePage(node.id),
    onSuccess: () => {
      invalidate();
      if (isActive) router.push('/');
      toastWithUndo(`"${node.title || 'Untitled'}" moved to Trash`, () => {
        api.restorePage(node.id).then(invalidate);
      });
    },
  });

  const rename = useMutation({
    mutationFn: (title: string) => api.updatePage(node.id, { title }),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['page', node.id] });
    },
  });

  return (
    <>
      <div
        ref={(el) => {
          setDragRef(el);
          setDropRef(el);
        }}
        draggable={!renaming}
        onDragStart={(e) => {
          e.dataTransfer.setData(PAGE_DRAG_MIME_TYPE, node.id);
          e.dataTransfer.effectAllowed = 'copy';
        }}
        className={`group/row relative flex items-center rounded pr-1 ${
          isSelected
            ? 'bg-blue-100 dark:bg-blue-950/60'
            : isActive
              ? 'bg-zinc-200/70 dark:bg-zinc-800'
              : 'hover:bg-zinc-200/50 dark:hover:bg-zinc-800/60'
        } ${isDragging ? 'opacity-40' : ''} ${dropZone === 'into' ? 'ring-1 ring-inset ring-blue-400' : ''}`}
        style={{ paddingLeft: 4 + depth * 12 }}
      >
        {dropZone === 'before' && (
          <span className="pointer-events-none absolute -top-px left-0 right-0 h-0.5 bg-blue-400" />
        )}
        {dropZone === 'after' && (
          <span className="pointer-events-none absolute -bottom-px left-0 right-0 h-0.5 bg-blue-400" />
        )}
        <span
          {...attributes}
          {...listeners}
          className="flex h-5 w-3 shrink-0 cursor-grab items-center justify-center text-xs text-zinc-300 opacity-0 hover:text-zinc-500 group-hover/row:opacity-100"
          title="Drag to reorder or move"
        >
          ⠿
        </span>
        <button
          type="button"
          onClick={() => toggleExpanded(node.id)}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs text-zinc-400 hover:bg-zinc-300/60 dark:hover:bg-zinc-700 ${
            hasChildren ? '' : 'invisible'
          }`}
          title={isExpanded ? 'Collapse' : 'Expand'}
        >
          <span className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}>›</span>
        </button>

        {renaming ? (
          <RenameInput
            initial={node.title}
            onCommit={(title) => {
              if (title && title !== node.title) rename.mutate(title);
              setRenaming(false);
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <Link
            href={`/${node.id}`}
            onClick={handleRowClick}
            className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-sm"
          >
            <span className="shrink-0 text-[13px]">{node.icon ?? '📄'}</span>
            <span
              className={`truncate ${
                isActive
                  ? 'text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-600 dark:text-zinc-300'
              }`}
            >
              {node.title || 'Untitled'}
            </span>
          </Link>
        )}

        {!renaming && (
          <div className="flex shrink-0 items-center opacity-0 focus-within:opacity-100 group-hover/row:opacity-100">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  title="Page options"
                  className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-300/60 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                >
                  ⋯
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setRenaming(true)}>
                  <span className="w-4 shrink-0 text-center text-zinc-400">✎</span>
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => duplicate.mutate()}>
                  <span className="w-4 shrink-0 text-center text-zinc-400">⧉</span>
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <span className="w-4 shrink-0 text-center text-zinc-400">→</span>
                    Move to…
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
                    <MoveToItems page={node} />
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem
                  onClick={() =>
                    void navigator.clipboard.writeText(`${window.location.origin}/${node.id}`)
                  }
                >
                  <span className="w-4 shrink-0 text-center text-zinc-400">🔗</span>
                  Copy link
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem danger onClick={() => archive.mutate()}>
                  <span className="w-4 shrink-0 text-center">🗑</span>
                  Move to Trash
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {onPeek && (
              <button
                type="button"
                onClick={() => onPeek(node.id)}
                title="Peek"
                className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-300/60 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
              >
                👁
              </button>
            )}

            <button
              type="button"
              onClick={() => addSubpage.mutate()}
              title="Add a page inside"
              className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-300/60 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
            >
              +
            </button>
          </div>
        )}
      </div>

      {isExpanded &&
        (hasChildren ? (
          node.children.map((child) => (
            <SidebarRow
              key={child.id}
              node={child}
              depth={depth + 1}
              activePageId={activePageId}
              dragState={dragState}
              visibleIds={visibleIds}
              onPeek={onPeek}
            />
          ))
        ) : (
          <p
            className="py-1 text-xs text-zinc-400 dark:text-zinc-600"
            style={{ paddingLeft: 28 + depth * 12 }}
          >
            No pages inside
          </p>
        ))}
    </>
  );
}

function RenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (title: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(value.trim());
        if (e.key === 'Escape') onCancel();
      }}
      className="my-0.5 min-w-0 flex-1 rounded border border-zinc-300 bg-white px-1 py-0.5 text-sm outline-none dark:border-zinc-600 dark:bg-zinc-900"
    />
  );
}
