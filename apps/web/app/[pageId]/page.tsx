'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { getContentType } from '@/features/content-types/registry';
import { PageHeader } from '@/features/shell/page-header';
import { Topbar } from '@/features/shell/topbar';
import { api, type UpdatePageInput } from '@/lib/api';
import { usePagePref } from '@/stores/page-prefs';

/**
 * Page shell: topbar (breadcrumb + actions), header (cover/icon/title), then
 * the content-type renderer from the registry (§11A). The shell is identical
 * for every page type — only the renderer swaps — which is what lets a new
 * content type appear fully-formed without touching this file.
 */
export default function PageDetail() {
  const params = useParams<{ pageId: string }>();
  const pageId = params.pageId;
  const queryClient = useQueryClient();
  const prefs = usePagePref(pageId);

  const { data: page, isLoading, isError } = useQuery({
    queryKey: ['page', pageId],
    queryFn: () => api.getPage(pageId),
    enabled: !!pageId,
  });

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

  const ContentRenderer = getContentType(page.type)?.renderer;
  const fullWidth = prefs.fullWidth ?? false;
  const contentWidth = fullWidth ? 'max-w-none px-16' : 'mx-auto max-w-3xl px-8';

  return (
    <>
      <Topbar page={page} />

      <PageHeader
        page={page}
        fullWidth={fullWidth}
        onUpdate={(body) => updatePage.mutate(body)}
      />

      <div className={`${contentWidth} pb-32 pt-4 ${prefs.smallText ? 'text-sm' : ''}`}>
        {ContentRenderer ? (
          <ContentRenderer pageId={pageId} />
        ) : (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">
            “{page.type}” pages are not editable yet.
          </p>
        )}
      </div>
    </>
  );
}
