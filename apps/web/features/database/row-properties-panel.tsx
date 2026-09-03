'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { DatabaseProperty } from '@/lib/types';
import { Cell } from './database-views';
import { mergeRowValues } from './database.lib';

/**
 * The panel above a row page's content (§20D.1) — every property except the
 * title (already the page's own title/header) rendered through the same
 * `Cell` component the table/board views use, so editing behaves identically
 * everywhere. Renders nothing for a page that isn't a row page.
 */
export function RowPropertiesPanel({ pageId, databaseId }: { pageId: string; databaseId: string }) {
  const queryClient = useQueryClient();

  const { data: row } = useQuery({
    queryKey: ['row-by-page', pageId],
    queryFn: () => api.getRowByPage(pageId),
  });
  const { data: agg } = useQuery({
    queryKey: ['database', databaseId],
    queryFn: () => api.getDatabaseById(databaseId),
  });

  const updateRow = useMutation({
    mutationFn: ({ values }: { values: Record<string, unknown> }) => api.updateRow(row!.id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['row-by-page', pageId] });
      queryClient.invalidateQueries({ queryKey: ['database', databaseId] });
      queryClient.invalidateQueries({ queryKey: ['database-query'] });
      queryClient.invalidateQueries({ queryKey: ['page', pageId] });
    },
  });

  if (!row || !agg) return null;

  const properties = agg.properties.filter((p: DatabaseProperty) => p.type !== 'title');
  if (properties.length === 0) return null;

  return (
    <div className="my-2 rounded border border-zinc-200 dark:border-zinc-800">
      {properties.map((property) => (
        <div
          key={property.id}
          className="flex items-center border-b border-zinc-100 px-2 py-1 text-sm last:border-0 dark:border-zinc-800"
        >
          <span className="w-32 shrink-0 text-zinc-400">{property.name}</span>
          <div className="min-w-0 flex-1">
            <Cell
              property={property}
              value={row.values?.[property.id]}
              onCommit={(value) => updateRow.mutate({ values: mergeRowValues(row, property.id, value) })}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
