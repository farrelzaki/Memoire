'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import type { DatabaseProperty, DatabaseRow, PropertyType } from '@/lib/types';
import { applyFilter, applySort, type Filter, type Sort } from './database.lib';
import { BoardView, CalendarView, GalleryView, TableView } from './database-views';

type ViewType = 'table' | 'board' | 'calendar' | 'gallery';

export function DatabaseEditor({ pageId }: { pageId: string }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter | null>(null);
  const [sort, setSort] = useState<Sort | null>(null);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [addingView, setAddingView] = useState(false);

  const { data: agg, isLoading } = useQuery({
    queryKey: ['database', pageId],
    queryFn: () => api.getDatabase(pageId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['database', pageId] });

  const createProperty = useMutation({
    mutationFn: (input: { name: string; type: PropertyType; config?: Record<string, unknown> }) =>
      api.createProperty(agg!.database.id, input),
    onSuccess: invalidate,
  });

  const createRow = useMutation({
    mutationFn: (values?: Record<string, unknown>) => api.createRow(agg!.database.id, values),
    onSuccess: invalidate,
  });

  const updateRow = useMutation({
    mutationFn: ({ id, values }: { id: string; values: Record<string, unknown> }) =>
      api.updateRow(id, values),
    onSuccess: invalidate,
  });

  const deleteRow = useMutation({
    mutationFn: (id: string) => api.deleteRow(id),
    onSuccess: invalidate,
  });

  const createView = useMutation({
    mutationFn: (input: { name: string; type: string; config?: Record<string, unknown> }) =>
      api.createView(agg!.database.id, input),
    onSuccess: invalidate,
  });

  const deleteView = useMutation({
    mutationFn: (id: string) => api.deleteView(id),
    onSuccess: invalidate,
  });

  if (isLoading || !agg) {
    return <div className="p-10 text-sm text-zinc-400 dark:text-zinc-500">Loading…</div>;
  }

  const { properties, rows, views } = agg;
  const activeView = views.find((v) => v.id === activeViewId) ?? views[0];
  const filtered = filter ? applyFilter(rows, filter) : rows;
  const sorted = sort ? applySort(filtered, sort) : filtered;

  const commitCell = (row: DatabaseRow, property: DatabaseProperty, value: unknown) => {
    updateRow.mutate({ id: row.id, values: { ...(row.values ?? {}), [property.id]: value } });
  };

  const toggleSort = (propertyId: string) => {
    setSort((prev) => {
      if (prev?.propertyId === propertyId) {
        return prev.direction === 'asc' ? { propertyId, direction: 'desc' } : null;
      }
      return { propertyId, direction: 'asc' };
    });
  };

  const addView = (type: ViewType) => {
    let config: Record<string, unknown> | undefined;
    if (type === 'board') {
      const select = properties.find((p) => p.type === 'select');
      config = select ? { groupBy: select.id } : {};
    } else if (type === 'calendar') {
      const date = properties.find((p) => p.type === 'date');
      config = date ? { dateProperty: date.id } : {};
    }
    createView.mutate(
      { name: type.charAt(0).toUpperCase() + type.slice(1), type, config },
      { onSuccess: (view) => setActiveViewId(view.id) },
    );
    setAddingView(false);
  };

  let content: React.ReactNode;
  if (activeView.type === 'table') {
    content = (
      <TableView
        properties={properties}
        rows={sorted}
        sort={sort}
        toggleSort={toggleSort}
        commitCell={commitCell}
        deleteRow={(id) => deleteRow.mutate(id)}
        createRow={() => createRow.mutate()}
        createProperty={(input) => createProperty.mutate(input)}
      />
    );
  } else if (activeView.type === 'board') {
    const selectProps = properties.filter((p) => p.type === 'select');
    const groupBy = properties.find((p) => p.id === activeView.config?.groupBy) ?? selectProps[0];
    content = groupBy ? (
      <BoardView
        properties={properties}
        rows={filtered}
        groupBy={groupBy}
        commitCell={commitCell}
        createRow={(values) => createRow.mutate(values)}
      />
    ) : (
      <p className="text-zinc-400 dark:text-zinc-500">Add a “select” property to use the board view.</p>
    );
  } else if (activeView.type === 'calendar') {
    const dateProps = properties.filter((p) => p.type === 'date');
    const dateProperty = properties.find((p) => p.id === activeView.config?.dateProperty) ?? dateProps[0];
    content = dateProperty ? (
      <CalendarView properties={properties} rows={filtered} dateProperty={dateProperty} />
    ) : (
      <p className="text-zinc-400 dark:text-zinc-500">Add a “date” property to use the calendar view.</p>
    );
  } else {
    content = <GalleryView properties={properties} rows={filtered} createRow={() => createRow.mutate()} />;
  }

  return (
    <div className="mt-6 text-sm">
      {/* Filter bar */}
      <div className="mb-2 flex items-center gap-2">
        <select
          value={filter?.propertyId ?? ''}
          onChange={(e) =>
            setFilter(e.target.value ? { propertyId: e.target.value, operator: 'contains', value: '' } : null)
          }
          className="rounded border border-zinc-200 bg-transparent px-2 py-1 text-sm dark:border-zinc-700 dark:text-zinc-100"
        >
          <option value="">No filter</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {filter && (
          <>
            <select
              value={filter.operator}
              onChange={(e) => setFilter({ ...filter, operator: e.target.value as Filter['operator'] })}
              className="rounded border border-zinc-200 bg-transparent px-2 py-1 text-sm dark:border-zinc-700 dark:text-zinc-100"
            >
              <option value="contains">contains</option>
              <option value="equals">equals</option>
              <option value="not_equals">does not equal</option>
              <option value="is_empty">is empty</option>
              <option value="is_not_empty">is not empty</option>
            </select>
            {filter.operator !== 'is_empty' && filter.operator !== 'is_not_empty' && (
              <input
                value={String(filter.value ?? '')}
                onChange={(e) => setFilter({ ...filter, value: e.target.value })}
                placeholder="Value"
                className="rounded border border-zinc-200 bg-transparent px-2 py-1 text-sm outline-none dark:border-zinc-700 dark:text-zinc-100"
              />
            )}
          </>
        )}
        {filter && (
          <button onClick={() => setFilter(null)} className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
            Clear
          </button>
        )}
      </div>

      {/* View switcher */}
      <div className="mb-2 flex items-center gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {views.map((view) => (
          <div key={view.id} className="group flex items-center">
            <button
              onClick={() => setActiveViewId(view.id)}
              className={`px-2 py-1.5 text-sm ${
                view.id === activeView.id
                  ? 'border-b-2 border-zinc-900 font-medium text-zinc-900 dark:border-zinc-100 dark:text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              {view.name}
            </button>
            {views.length > 1 && view.id === activeView.id && (
              <button
                onClick={() => deleteView.mutate(view.id)}
                className="px-1 text-xs text-zinc-300 opacity-0 hover:text-red-500 group-hover:opacity-100"
                title="Delete view"
              >
                ×
              </button>
            )}
          </div>
        ))}
        <div className="relative ml-1">
          <button
            onClick={() => setAddingView((v) => !v)}
            className="px-2 py-1.5 text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            +
          </button>
          {addingView && (
            <div className="absolute left-0 top-8 z-50 w-32 rounded border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
              {(['table', 'board', 'calendar', 'gallery'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => addView(type)}
                  className="block w-full rounded px-2 py-1 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {content}
    </div>
  );
}
