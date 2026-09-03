'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';

/** Collapsed-by-default backlink list under the page title (§15A.3). Renders nothing when there are none. */
export function BacklinksPanel({ pageId }: { pageId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { data: backlinks = [] } = useQuery({
    queryKey: ['backlinks', pageId],
    queryFn: () => api.getBacklinks(pageId),
  });

  if (backlinks.length === 0) return null;

  return (
    <div className="mt-2 text-sm text-zinc-500">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 hover:text-zinc-700 dark:hover:text-zinc-300">
        <span className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
        Linked from {backlinks.length} {backlinks.length === 1 ? 'page' : 'pages'}
      </button>
      {open && (
        <ul className="mt-1 space-y-1 border-l border-zinc-200 pl-3 dark:border-zinc-700">
          {backlinks.map((b) => (
            <li key={`${b.sourcePageId}-${b.sourceBlockId}`}>
              <button
                onClick={() => router.push(`/${b.sourcePageId}`)}
                className="text-left hover:underline"
              >
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {b.sourcePageTitle || 'Untitled'}
                </span>
                {b.snippet && <span className="text-zinc-400"> — {b.snippet}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
