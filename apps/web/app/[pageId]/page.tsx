'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
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
  }, [page?.title, page]);

  const updatePage = useMutation({
    mutationFn: (body: UpdatePageInput) => api.updatePage(pageId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['page', pageId] });
      queryClient.invalidateQueries({ queryKey: ['pages'] });
    },
  });

  if (isLoading) {
    return <div className="p-10 text-sm text-zinc-400">Loading…</div>;
  }
  if (isError || !page) {
    return <div className="p-10 text-sm text-zinc-500">Page not found.</div>;
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
        className="w-full text-3xl font-bold text-zinc-900 outline-none placeholder:text-zinc-300"
      />
      <p className="mt-10 text-sm text-zinc-400">
        Block content (Tiptap editor) arrives in Sprint 3.
      </p>
    </div>
  );
}
