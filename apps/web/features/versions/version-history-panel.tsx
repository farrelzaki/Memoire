'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useState } from 'react';
import { DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { BlockTypeRegistry } from '@/features/editor/block-type-registry';
import { api } from '@/lib/api';
import type { BlockDiffEntry, VersionSummary } from '@/lib/types';

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

const KIND_LABEL: Record<VersionSummary['kind'], string> = {
  auto: 'Auto-saved',
  manual: 'Saved',
  pre_restore: 'Before restore',
  pre_import: 'Before import',
};

/**
 * §33A version history panel — Radix Dialog, following `PagePeek`'s
 * structure (Sprint 22): a read-only render of a selected version reuses
 * `BlockTypeRegistry.get(type).toHtml` per block, same as that component.
 * Diff view is a flat list of changes, not a side-by-side view — kept
 * simple, no existing UI precedent for anything fancier (ADR-26).
 */
export function VersionHistoryPanel({ pageId, onClose }: { pageId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [label, setLabel] = useState('');
  const [mode, setMode] = useState<'view' | 'diff'>('view');

  const { data: versions = [] } = useQuery({
    queryKey: ['versions', pageId],
    queryFn: () => api.listVersions(pageId),
  });

  const activeId = selected[selected.length - 1] ?? null;
  const { data: activeContent } = useQuery({
    queryKey: ['version-content', activeId],
    queryFn: () => api.getVersion(activeId!),
    enabled: !!activeId && mode === 'view',
  });

  const canDiff = selected.length === 2;
  const { data: diffResult } = useQuery({
    queryKey: ['version-diff', selected[0], selected[1]],
    queryFn: () => api.diffVersions(selected[0], selected[1]),
    enabled: canDiff && mode === 'diff',
  });

  const saveVersion = useMutation({
    mutationFn: () => api.saveVersion(pageId, label || undefined),
    onSuccess: () => {
      setLabel('');
      queryClient.invalidateQueries({ queryKey: ['versions', pageId] });
    },
  });

  const restore = useMutation({
    mutationFn: (versionId: string) => api.restoreVersion(versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blocks', pageId] });
      queryClient.invalidateQueries({ queryKey: ['page', pageId] });
      queryClient.invalidateQueries({ queryKey: ['versions', pageId] });
      onClose();
    },
  });

  const toggleSelect = (id: string) => {
    setMode('view');
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((s) => s !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const html = (activeContent?.blocks ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((block) => (block.content ? (BlockTypeRegistry.get(block.type)?.toHtml(block.content) ?? '') : ''))
    .join('');

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 flex h-[85vh] w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between gap-2 border-b border-zinc-100 p-4 dark:border-zinc-900">
            <DialogPrimitive.Title className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Version history
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200">
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex min-h-0 flex-1">
            <div className="flex w-64 shrink-0 flex-col border-r border-zinc-100 dark:border-zinc-900">
              <div className="flex items-center gap-1 border-b border-zinc-100 p-2 dark:border-zinc-900">
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Label (optional)"
                  className="min-w-0 flex-1 rounded border border-zinc-200 bg-transparent px-2 py-1 text-xs dark:border-zinc-700"
                />
                <button
                  onClick={() => saveVersion.mutate()}
                  disabled={saveVersion.isPending}
                  className="shrink-0 rounded bg-zinc-900 px-2 py-1 text-xs text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  Save now
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {versions.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => toggleSelect(v.id)}
                    className={`block w-full border-b border-zinc-50 px-3 py-2 text-left text-xs dark:border-zinc-900 ${
                      selected.includes(v.id)
                        ? 'bg-zinc-100 dark:bg-zinc-800'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-900'
                    }`}
                  >
                    <div className="flex items-center gap-1 font-medium text-zinc-800 dark:text-zinc-200">
                      <span className="shrink-0">{v.icon ?? '📄'}</span>
                      <span className="truncate">{v.label || v.title || 'Untitled'}</span>
                    </div>
                    <div className="text-zinc-400">
                      {KIND_LABEL[v.kind]} · {formatTimestamp(v.createdAt)}
                    </div>
                  </button>
                ))}
                {versions.length === 0 && (
                  <p className="px-3 py-2 text-xs text-zinc-400">No versions saved yet.</p>
                )}
              </div>
              {canDiff && (
                <div className="border-t border-zinc-100 p-2 dark:border-zinc-900">
                  <button
                    onClick={() => setMode('diff')}
                    className="w-full rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  >
                    Compare selected
                  </button>
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              {mode === 'diff' && diffResult ? (
                <DiffView entries={diffResult.blockDiffs} titleChanged={diffResult.titleChanged} iconChanged={diffResult.iconChanged} />
              ) : activeId ? (
                html ? (
                  <div
                    className="pointer-events-none space-y-2 text-sm leading-relaxed text-zinc-700 [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-300 [&_blockquote]:pl-3 [&_blockquote]:italic [&_code]:rounded [&_code]:bg-zinc-100 [&_code]:px-1 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_hr]:border-zinc-200 [&_li]:ml-4 [&_ol]:list-decimal [&_ul]:list-disc dark:text-zinc-300 dark:[&_blockquote]:border-zinc-700 dark:[&_code]:bg-zinc-800 dark:[&_hr]:border-zinc-800"
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                ) : (
                  <p className="text-sm text-zinc-400 dark:text-zinc-500">This version is empty.</p>
                )
              ) : (
                <p className="text-sm text-zinc-400 dark:text-zinc-500">
                  Select a version to preview it, or select two to compare.
                </p>
              )}
            </div>
          </div>

          {activeId && mode === 'view' && (
            <div className="border-t border-zinc-100 p-4 dark:border-zinc-900">
              <button
                onClick={() => restore.mutate(activeId)}
                disabled={restore.isPending}
                className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {restore.isPending ? 'Restoring…' : 'Restore this version'}
              </button>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}

function DiffView({
  entries,
  titleChanged,
  iconChanged,
}: {
  entries: BlockDiffEntry[];
  titleChanged: boolean;
  iconChanged: boolean;
}) {
  if (entries.length === 0 && !titleChanged && !iconChanged) {
    return <p className="text-sm text-zinc-400 dark:text-zinc-500">No differences between these versions.</p>;
  }

  return (
    <div className="space-y-3 text-sm">
      {(titleChanged || iconChanged) && (
        <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-400">
          {titleChanged && iconChanged ? 'Title and icon changed.' : titleChanged ? 'Title changed.' : 'Icon changed.'}
        </p>
      )}
      {entries.map((entry) => (
        <div key={entry.blockId} className="rounded border border-zinc-100 p-2 dark:border-zinc-800">
          <span
            className={`mr-2 rounded px-1.5 py-0.5 text-xs font-medium ${
              entry.status === 'added'
                ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
                : entry.status === 'removed'
                  ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
                  : entry.status === 'moved'
                    ? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                    : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400'
            }`}
          >
            {entry.status}
          </span>
          <span className="text-xs text-zinc-400">{entry.type ?? 'block'}</span>
          {entry.wordDiff && (
            <p className="mt-1 leading-relaxed">
              {entry.wordDiff.map((token, i) => (
                <span
                  key={i}
                  className={
                    token.op === 'insert'
                      ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                      : token.op === 'delete'
                        ? 'bg-red-100 text-red-800 line-through dark:bg-red-950 dark:text-red-300'
                        : ''
                  }
                >
                  {token.text}
                </span>
              ))}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
