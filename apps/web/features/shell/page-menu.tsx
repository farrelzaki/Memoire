'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '@/components/ui/menu';
import { api } from '@/lib/api';
import { downloadJson } from '@/lib/download';
import { getSubtreeIds } from '@/lib/pages';
import type { Page } from '@/lib/types';
import { usePagePref, usePagePrefsStore } from '@/stores/page-prefs';

/**
 * The page `⋯` menu — the per-page action surface Notion puts in the topbar:
 * layout toggles, duplicate, move, copy link, export, and delete.
 */
export function PageMenu({ page, onClose }: { page: Page; onClose: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [moveOpen, setMoveOpen] = useState(false);

  const prefs = usePagePref(page.id);
  const toggleFullWidth = usePagePrefsStore((s) => s.toggleFullWidth);
  const toggleSmallText = usePagePrefsStore((s) => s.toggleSmallText);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['pages'] });
    queryClient.invalidateQueries({ queryKey: ['page', page.id] });
  };

  const duplicate = useMutation({
    mutationFn: () => api.duplicatePage(page.id),
    onSuccess: (copy) => {
      invalidate();
      router.push(`/${copy.id}`);
      onClose();
    },
  });

  const archive = useMutation({
    mutationFn: () => api.archivePage(page.id),
    onSuccess: () => {
      invalidate();
      router.push('/');
      onClose();
    },
  });

  const favorite = useMutation({
    mutationFn: () => api.updatePage(page.id, { isFavorite: !page.isFavorite }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  const copyLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/${page.id}`);
    onClose();
  };

  const exportPage = async () => {
    const blocks = page.type === 'document' ? await api.listBlocks(page.id) : [];
    downloadJson(`${page.title || 'untitled'}.json`, { page, blocks });
    onClose();
  };

  if (moveOpen) {
    return <MoveToMenu page={page} onDone={onClose} onBack={() => setMoveOpen(false)} />;
  }

  return (
    <Menu onClose={onClose} align="right">
      <MenuItem
        icon={page.isFavorite ? '★' : '☆'}
        label={page.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
        onClick={() => favorite.mutate()}
      />
      <MenuSeparator />
      <MenuItem
        icon="↔"
        label="Full width"
        hint={prefs.fullWidth ? 'On' : 'Off'}
        onClick={() => toggleFullWidth(page.id)}
      />
      <MenuItem
        icon="A"
        label="Small text"
        hint={prefs.smallText ? 'On' : 'Off'}
        onClick={() => toggleSmallText(page.id)}
      />
      <MenuSeparator />
      <MenuItem icon="⧉" label="Duplicate" onClick={() => duplicate.mutate()} />
      <MenuItem icon="→" label="Move to…" onClick={() => setMoveOpen(true)} />
      <MenuItem icon="🔗" label="Copy link" onClick={() => void copyLink()} />
      <MenuItem icon="⭳" label="Export" onClick={() => void exportPage()} />
      <MenuSeparator />
      <MenuItem icon="🗑" label="Move to Trash" danger onClick={() => archive.mutate()} />
    </Menu>
  );
}

/**
 * Destination picker for "Move to". A page's own subtree is excluded — the
 * backend rejects those moves, so they should never be offered.
 */
function MoveToMenu({
  page,
  onDone,
  onBack,
}: {
  page: Page;
  onDone: () => void;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: pages = [] } = useQuery({ queryKey: ['pages'], queryFn: api.listPages });

  const move = useMutation({
    mutationFn: (parentPageId: string | null) => api.movePage(page.id, { parentPageId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pages'] });
      queryClient.invalidateQueries({ queryKey: ['page', page.id] });
      onDone();
    },
  });

  const excluded = getSubtreeIds(pages, page.id);
  const targets = pages.filter((p) => !p.isArchived && !excluded.has(p.id));

  return (
    <Menu onClose={onDone} align="right" className="max-h-80 overflow-y-auto">
      <MenuItem icon="‹" label="Back" onClick={onBack} />
      <MenuSeparator />
      <MenuLabel>Move to</MenuLabel>
      <MenuItem
        icon="🏠"
        label="Workspace (top level)"
        disabled={page.parentPageId === null}
        onClick={() => move.mutate(null)}
      />
      {targets.map((target) => (
        <MenuItem
          key={target.id}
          icon={target.icon ?? '📄'}
          label={target.title || 'Untitled'}
          disabled={target.id === page.parentPageId}
          onClick={() => move.mutate(target.id)}
        />
      ))}
      {targets.length === 0 && (
        <p className="px-2 py-1.5 text-sm text-zinc-400">No other pages.</p>
      )}
    </Menu>
  );
}
