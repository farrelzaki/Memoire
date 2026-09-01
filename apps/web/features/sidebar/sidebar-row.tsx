'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/menu';
import { api } from '@/lib/api';
import type { PageTreeNode } from '@/lib/pages';
import { useSidebarStore } from '@/stores/sidebar';

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
}: {
  node: PageTreeNode;
  depth: number;
  activePageId?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);

  const expandedIds = useSidebarStore((s) => s.expanded);
  const toggleExpanded = useSidebarStore((s) => s.toggleExpanded);
  const expand = useSidebarStore((s) => s.expand);

  const isExpanded = expandedIds.includes(node.id);
  const isActive = node.id === activePageId;
  const hasChildren = node.children.length > 0;

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
        className={`group/row relative flex items-center rounded pr-1 ${
          isActive
            ? 'bg-zinc-200/70 dark:bg-zinc-800'
            : 'hover:bg-zinc-200/50 dark:hover:bg-zinc-800/60'
        }`}
        style={{ paddingLeft: 4 + depth * 12 }}
      >
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
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                title="Page options"
                className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-300/60 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
              >
                ⋯
              </button>
              {menuOpen && (
                <Menu onClose={() => setMenuOpen(false)} align="right">
                  <MenuItem
                    icon="✎"
                    label="Rename"
                    onClick={() => {
                      setRenaming(true);
                      setMenuOpen(false);
                    }}
                  />
                  <MenuItem
                    icon="⧉"
                    label="Duplicate"
                    onClick={() => {
                      duplicate.mutate();
                      setMenuOpen(false);
                    }}
                  />
                  <MenuItem
                    icon="🔗"
                    label="Copy link"
                    onClick={() => {
                      void navigator.clipboard.writeText(
                        `${window.location.origin}/${node.id}`,
                      );
                      setMenuOpen(false);
                    }}
                  />
                  <MenuSeparator />
                  <MenuItem
                    icon="🗑"
                    label="Move to Trash"
                    danger
                    onClick={() => {
                      archive.mutate();
                      setMenuOpen(false);
                    }}
                  />
                </Menu>
              )}
            </div>

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
