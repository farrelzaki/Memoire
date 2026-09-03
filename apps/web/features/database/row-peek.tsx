'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { rowTitle } from './database-views';
import { RowPropertiesPanel } from './row-properties-panel';
import type { DatabaseProperty, DatabaseRow } from '@/lib/types';

/**
 * Side or center peek (§20D.6) — the row's properties, quick to edit without
 * leaving the current page, plus a link to the full row page. Deliberately
 * doesn't embed the row's block content: a second live Tiptap instance
 * inside a dialog is a separate set of problems (focus trapping, nested
 * scroll, autosave conflicts) this sprint doesn't take on.
 */
export function RowPeek({
  row,
  properties,
  mode,
  onClose,
}: {
  row: DatabaseRow;
  properties: DatabaseProperty[];
  mode: 'side' | 'center';
  onClose: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const title = rowTitle(properties, row) || 'Untitled';

  const saveAsTemplate = useMutation({
    mutationFn: () =>
      api.createTemplate(row.databaseId, { name: title, content: row.values ?? {} }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates', row.databaseId] }),
  });

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className={
            mode === 'side'
              ? 'fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-zinc-200 bg-white p-6 shadow-xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right dark:border-zinc-800 dark:bg-zinc-950'
              : 'fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-6 shadow-xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 dark:border-zinc-800 dark:bg-zinc-950'
          }
        >
          <div className="mb-3 flex items-start justify-between gap-2">
            <DialogPrimitive.Title className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200">
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          {row.pageId && <RowPropertiesPanel pageId={row.pageId} databaseId={row.databaseId} />}

          <div className="mt-3 flex items-center justify-between">
            {row.pageId && (
              <button
                onClick={() => router.push(`/${row.pageId}`)}
                className="text-left text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
              >
                Open full page →
              </button>
            )}
            <button
              onClick={() => saveAsTemplate.mutate()}
              disabled={saveAsTemplate.isPending}
              className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              {saveAsTemplate.isSuccess ? 'Saved as template ✓' : 'Save as template'}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}
