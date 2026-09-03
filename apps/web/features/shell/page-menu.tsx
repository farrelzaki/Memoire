'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { countWords } from '@/features/editor/block-type-registry';
import { api } from '@/lib/api';
import { downloadJson } from '@/lib/download';
import { getSubtreeIds } from '@/lib/pages';
import type { Page, PageSettings } from '@/lib/types';
import { toastWithUndo } from '@/stores/toast';

const FONT_OPTIONS: Array<{ value: NonNullable<PageSettings['font']>; label: string }> = [
  { value: 'default', label: 'Default' },
  { value: 'serif', label: 'Serif' },
  { value: 'mono', label: 'Mono' },
];

/**
 * The page `⋯` menu — the per-page action surface Notion puts in the topbar:
 * layout toggles, duplicate, move, copy link, export, and delete. Rendered
 * as the content of a `DropdownMenu` whose trigger lives in `topbar.tsx`.
 */
export function PageMenu({ page }: { page: Page }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['pages'] });
    queryClient.invalidateQueries({ queryKey: ['page', page.id] });
  };

  const updateSettings = useMutation({
    mutationFn: (patch: PageSettings) =>
      api.updatePage(page.id, { settings: { ...page.settings, ...patch } }),
    onSuccess: invalidate,
  });

  const { data: blocks = [] } = useQuery({
    queryKey: ['blocks', page.id],
    queryFn: () => api.listBlocks(page.id),
    enabled: page.type === 'document',
  });
  const wordCount = countWords(blocks);

  const duplicate = useMutation({
    mutationFn: () => api.duplicatePage(page.id),
    onSuccess: (copy) => {
      invalidate();
      router.push(`/${copy.id}`);
    },
  });

  const archive = useMutation({
    mutationFn: () => api.archivePage(page.id),
    onSuccess: () => {
      invalidate();
      router.push('/');
      toastWithUndo(`"${page.title || 'Untitled'}" moved to Trash`, () => {
        api.restorePage(page.id).then(invalidate);
      });
    },
  });

  const favorite = useMutation({
    mutationFn: () => api.updatePage(page.id, { isFavorite: !page.isFavorite }),
    onSuccess: invalidate,
  });

  const exportPage = async () => {
    const blocks = page.type === 'document' ? await api.listBlocks(page.id) : [];
    downloadJson(`${page.title || 'untitled'}.json`, { page, blocks });
  };

  return (
    <DropdownMenuContent align="end" className="w-56">
      <DropdownMenuItem onClick={() => favorite.mutate()}>
        <span className="w-4 shrink-0 text-center text-zinc-400">
          {page.isFavorite ? '★' : '☆'}
        </span>
        {page.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onSelect={(e) => e.preventDefault()}
        onClick={() => updateSettings.mutate({ fullWidth: !page.settings.fullWidth })}
      >
        <span className="w-4 shrink-0 text-center text-zinc-400">↔</span>
        Full width
        <span className="ml-auto text-xs text-zinc-400">
          {page.settings.fullWidth ? 'On' : 'Off'}
        </span>
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={(e) => e.preventDefault()}
        onClick={() => updateSettings.mutate({ smallText: !page.settings.smallText })}
      >
        <span className="w-4 shrink-0 text-center text-zinc-400">A</span>
        Small text
        <span className="ml-auto text-xs text-zinc-400">
          {page.settings.smallText ? 'On' : 'Off'}
        </span>
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={(e) => e.preventDefault()}
        onClick={() => updateSettings.mutate({ locked: !page.settings.locked })}
      >
        <span className="w-4 shrink-0 text-center text-zinc-400">🔒</span>
        Lock page
        <span className="ml-auto text-xs text-zinc-400">
          {page.settings.locked ? 'On' : 'Off'}
        </span>
      </DropdownMenuItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <span className="w-4 shrink-0 text-center text-zinc-400">Aa</span>
          Font
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {FONT_OPTIONS.map((opt) => (
            <DropdownMenuItem
              key={opt.value}
              onClick={() => updateSettings.mutate({ font: opt.value })}
            >
              <span className="w-4 shrink-0 text-center text-zinc-400">
                {(page.settings.font ?? 'default') === opt.value ? '✓' : ''}
              </span>
              {opt.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      {page.type === 'document' && (
        <p className="px-2 py-1.5 text-xs text-zinc-400">
          {wordCount} {wordCount === 1 ? 'word' : 'words'}
        </p>
      )}
      <DropdownMenuSeparator />
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
          <MoveToItems page={page} />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuItem
        onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/${page.id}`)}
      >
        <span className="w-4 shrink-0 text-center text-zinc-400">🔗</span>
        Copy link
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => void exportPage()}>
        <span className="w-4 shrink-0 text-center text-zinc-400">⭳</span>
        Export
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem danger onClick={() => archive.mutate()}>
        <span className="w-4 shrink-0 text-center">🗑</span>
        Move to Trash
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

/**
 * Destination list for "Move to…". A page's own subtree is excluded — the
 * backend rejects those moves, so they should never be offered.
 */
function MoveToItems({ page }: { page: Page }) {
  const queryClient = useQueryClient();
  const { data: pages = [] } = useQuery({ queryKey: ['pages'], queryFn: api.listPages });

  const move = useMutation({
    mutationFn: (parentPageId: string | null) => api.movePage(page.id, { parentPageId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pages'] });
      queryClient.invalidateQueries({ queryKey: ['page', page.id] });
    },
  });

  const excluded = getSubtreeIds(pages, page.id);
  const targets = pages.filter((p) => !p.isArchived && !excluded.has(p.id));

  return (
    <>
      <DropdownMenuLabel>Move to</DropdownMenuLabel>
      <DropdownMenuItem
        disabled={page.parentPageId === null}
        onClick={() => move.mutate(null)}
      >
        <span className="w-4 shrink-0 text-center text-zinc-400">🏠</span>
        Workspace (top level)
      </DropdownMenuItem>
      {targets.map((target) => (
        <DropdownMenuItem
          key={target.id}
          disabled={target.id === page.parentPageId}
          onClick={() => move.mutate(target.id)}
        >
          <span className="w-4 shrink-0 text-center text-zinc-400">{target.icon ?? '📄'}</span>
          {target.title || 'Untitled'}
        </DropdownMenuItem>
      ))}
      {targets.length === 0 && (
        <p className="px-2 py-1.5 text-sm text-zinc-400">No other pages.</p>
      )}
    </>
  );
}
