'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { BlockTypeRegistry } from '@/features/editor/block-type-registry';
import { api } from '@/lib/api';
import '../print.css';

/**
 * Read-only, print-only render of a page (§30B.3, ADR-12 — PDF export is
 * `window.print()` on this route, never a headless-browser renderer). Does
 * NOT mount `DocumentEditor`/Tiptap: this route's only job is producing the
 * exact HTML to print, so it goes straight through `BlockTypeRegistry.toHtml`
 * (already required per block type, §11D.2/§30B.1) instead of shipping the
 * whole editor bundle to a route with no interactivity.
 */
export default function PrintPage() {
  const params = useParams<{ pageId: string }>();
  const pageId = params.pageId;

  const { data: page } = useQuery({ queryKey: ['page', pageId], queryFn: () => api.getPage(pageId) });
  const { data: blocks = [], isFetched: blocksFetched } = useQuery({
    queryKey: ['blocks', pageId],
    queryFn: () => api.listBlocks(pageId),
    enabled: page?.type === 'document',
  });

  const ready = !!page && (page.type !== 'document' || blocksFetched);

  useEffect(() => {
    if (!ready) return;
    // Give the browser one paint before the print dialog steals focus.
    const timer = setTimeout(() => window.print(), 300);
    return () => clearTimeout(timer);
  }, [ready]);

  if (!page) {
    return <div className="p-10 text-sm text-zinc-400">Loading…</div>;
  }

  // Toggle blocks always render `<details>` closed by default (native HTML
  // semantics) — force them open for print, since there's no reader to click
  // them open. `toHtml` never emits any other `<details>` tag shape, so a
  // plain string replace is exact and avoids adding a print-mode param to
  // all 26 block serializers for one block type's one attribute.
  const html = blocks
    .map((block) => (block.content ? BlockTypeRegistry.get(block.type)?.toHtml(block.content) : ''))
    .filter(Boolean)
    .join('\n')
    .replaceAll('<details>', '<details open>');

  return (
    <div className="print-page mx-auto max-w-3xl px-8 py-12">
      <h1 className="mb-6 text-3xl font-bold">
        {page.icon ? `${page.icon} ` : ''}
        {page.title || 'Untitled'}
      </h1>
      {page.type === 'document' ? (
        <div className="print-content" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p className="text-sm text-zinc-400">
          “{page.type}” pages don&apos;t have a print view yet.
        </p>
      )}
    </div>
  );
}
