'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { BlockTypeRegistry } from '@/features/editor/block-type-registry';
import { api } from '@/lib/api';

/**
 * Read-only page preview from the sidebar (§22.8, Sprint 22) — mirrors
 * `RowPeek`'s own precedent exactly: rendered HTML via each block type's
 * required `toHtml` serializer, never a live Tiptap instance, for the same
 * reasons (focus trapping, nested scroll, autosave conflicts). The whole
 * body is `pointer-events-none` so nothing inside (a rendered checkbox, a
 * link) is independently interactive — the preview reads as inert.
 */
export function PagePeek({ pageId, onClose }: { pageId: string; onClose: () => void }) {
  const router = useRouter();

  const { data: page } = useQuery({ queryKey: ['page', pageId], queryFn: () => api.getPage(pageId) });
  const { data: blocks = [] } = useQuery({
    queryKey: ['blocks', pageId],
    queryFn: () => api.listBlocks(pageId),
    enabled: page?.type === 'document',
  });

  const html = blocks
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((block) => (block.content ? (BlockTypeRegistry.get(block.type)?.toHtml(block.content) ?? '') : ''))
    .join('');

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-start justify-between gap-2 border-b border-zinc-100 p-4 dark:border-zinc-900">
            <DialogPrimitive.Title className="flex min-w-0 items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              <span className="shrink-0">{page?.icon ?? '📄'}</span>
              <span className="truncate">{page?.title || 'Untitled'}</span>
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200">
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            {page?.type === 'document' ? (
              html ? (
                <div
                  className="pointer-events-none space-y-2 text-sm leading-relaxed text-zinc-700 [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-300 [&_blockquote]:pl-3 [&_blockquote]:italic [&_code]:rounded [&_code]:bg-zinc-100 [&_code]:px-1 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_hr]:border-zinc-200 [&_li]:ml-4 [&_ol]:list-decimal [&_ul]:list-disc dark:text-zinc-300 dark:[&_blockquote]:border-zinc-700 dark:[&_code]:bg-zinc-800 dark:[&_hr]:border-zinc-800"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              ) : (
                <p className="text-sm text-zinc-400 dark:text-zinc-500">This page is empty.</p>
              )
            ) : (
              <p className="text-sm text-zinc-400 dark:text-zinc-500">
                “{page?.type}” pages don't have a preview yet.
              </p>
            )}
          </div>

          <div className="border-t border-zinc-100 p-4 dark:border-zinc-900">
            <button
              onClick={() => router.push(`/${pageId}`)}
              className="text-left text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
            >
              Open full page →
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}
