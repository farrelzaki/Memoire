'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DatabaseEditor } from '@/features/database/database-editor';
import { DocumentEditor } from '@/features/editor/document-editor';
import { api, type UpdatePageInput } from '@/lib/api';

export default function PageDetail() {
  const params = useParams<{ pageId: string }>();
  const pageId = params.pageId;
  const queryClient = useQueryClient();

  const { data: page, isLoading, isError } = useQuery({
    queryKey: ['page', pageId],
    queryFn: () => api.getPage(pageId),
    enabled: !!pageId,
  });

  const [title, setTitle] = useState('');
  useEffect(() => {
    if (page) setTitle(page.title);
  }, [page]);

  const updatePage = useMutation({
    mutationFn: (body: UpdatePageInput) => api.updatePage(pageId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['page', pageId] });
      queryClient.invalidateQueries({ queryKey: ['pages'] });
    },
  });

  if (isLoading) {
    return <div className="p-10 text-sm text-zinc-400 dark:text-zinc-500">Loading…</div>;
  }
  if (isError || !page) {
    return <div className="p-10 text-sm text-zinc-500 dark:text-zinc-400">Page not found.</div>;
  }

  const save = () => {
    if (title !== page.title) updatePage.mutate({ title });
  };

  return (
    <div className="mx-auto max-w-3xl px-8 py-12">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        placeholder="Untitled"
        className="w-full bg-transparent text-3xl font-bold text-zinc-900 outline-none placeholder:text-zinc-300 dark:text-zinc-100 dark:placeholder:text-zinc-600"
      />

      <div className="mt-6">
        {page.type === 'document' ? (
          <DocumentEditor pageId={pageId} />
        ) : page.type === 'database' ? (
          <DatabaseEditor pageId={pageId} />
        ) : (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">
            “{page.type}” pages are not editable yet.
          </p>
        )}
      </div>
    </div>
  );
}
