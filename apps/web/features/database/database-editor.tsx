'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import type { DatabaseProperty, DatabaseRow, PropertyType } from '@/lib/types';
import { applyFilter, applySort, type Filter, type Sort } from './database.lib';

function Cell({
  property,
  value,
  onCommit,
}: {
  property: DatabaseProperty;
  value: unknown;
  onCommit: (value: unknown) => void;
}) {
  const inputCls = 'w-full bg-transparent px-2 py-1 text-sm outline-none';

  switch (property.type) {
    case 'checkbox':
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onCommit(e.target.checked)}
          className="h-4 w-4"
        />
      );
    case 'number':
      return (
        <input
          type="number"
          defaultValue={typeof value === 'number' ? value : ''}
          onBlur={(e) => onCommit(e.target.value === '' ? null : Number(e.target.value))}
          className={inputCls}
        />
      );
    case 'date':
      return (
        <input
          type="date"
          defaultValue={typeof value === 'string' ? value : ''}
          onBlur={(e) => onCommit(e.target.value || null)}
          className={inputCls}
        />
      );
    case 'select': {
      const options = Array.isArray(property.config?.options)
        ? (property.config.options as string[])
        : [];
      const current = typeof value === 'string' ? value : '';
      if (options.length === 0) {
        return (
          <input
            type="text"
            defaultValue={current}
            onBlur={(e) => onCommit(e.target.value)}
            className={inputCls}
          />
        );
      }
      return (
        <select
          value={current}
          onChange={(e) => onCommit(e.target.value)}
          className={inputCls}
        >
          <option value="">—</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }
    default:
      return (
        <input
          type={property.type === 'url' ? 'url' : 'text'}
          defaultValue={typeof value === 'string' ? value : ''}
          onBlur={(e) => onCommit(e.target.value)}
          className={inputCls}
        />
      );
  }
}

function AddColumnForm({
  onAdd,
  onCancel,
}: {
  onAdd: (input: { name: string; type: PropertyType; config?: Record<string, unknown> }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<PropertyType>('text');
  const [options, setOptions] = useState('');

  const submit = () => {
    if (!name.trim()) return;
    const config =
      type === 'select'
        ? { options: options.split(',').map((s) => s.trim()).filter(Boolean) }
        : undefined;
    onAdd({ name: name.trim(), type, config });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 p-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Column name"
        className="rounded border border-zinc-200 px-2 py-1 text-sm outline-none focus:border-zinc-400"
      />
      <select
        value={type}
        onChange={(e) => setType(e.target.value as PropertyType)}
        className="rounded border border-zinc-200 px-2 py-1 text-sm"
      >
        {(['title', 'text', 'number', 'select', 'checkbox', 'date', 'url'] as const).map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      {type === 'select' && (
        <input
          value={options}
          onChange={(e) => setOptions(e.target.value)}
          placeholder="Option1, Option2"
          className="rounded border border-zinc-200 px-2 py-1 text-sm outline-none"
        />
      )}
      <button
        onClick={submit}
        className="rounded bg-zinc-900 px-2 py-1 text-sm text-white hover:bg-zinc-700"
      >
        Add
      </button>
      <button onClick={onCancel} className="text-sm text-zinc-400 hover:text-zinc-700">
        Cancel
      </button>
    </div>
  );
}

export function DatabaseEditor({ pageId }: { pageId: string }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter | null>(null);
  const [sort, setSort] = useState<Sort | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);

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
    mutationFn: () => api.createRow(agg!.database.id),
    onSuccess: invalidate,
  });

  const updateRow = useMutation({
    mutationFn: ({ id, values }: { id: string; values: Record<string, unknown> }) =>
      api.updateRow(id, values),
    onSuccess: invalidate,
  });

  if (isLoading || !agg) {
    return <div className="p-10 text-sm text-zinc-400">Loading…</div>;
  }

  const { properties, rows } = agg;
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

  return (
    <div className="mt-6 text-sm">
      {/* Filter bar */}
      <div className="mb-2 flex items-center gap-2">
        <select
          value={filter?.propertyId ?? ''}
          onChange={(e) =>
            setFilter(e.target.value ? { propertyId: e.target.value, operator: 'contains', value: '' } : null)
          }
          className="rounded border border-zinc-200 px-2 py-1 text-sm"
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
              className="rounded border border-zinc-200 px-2 py-1 text-sm"
            >
              <option value="contains">contains</option>
              <option value="equals">equals</option>
              <option value="not_equals">does not equal</option>
              <option value="is_empty">is empty</option>
              <option value="is_not_empty">is not empty</option>
            </select>
            {filter.operator === 'contains' && (
              <input
                value={String(filter.value ?? '')}
                onChange={(e) => setFilter({ ...filter, value: e.target.value })}
                placeholder="Filter…"
                className="rounded border border-zinc-200 px-2 py-1 text-sm outline-none"
              />
            )}
            {filter.operator === 'equals' || filter.operator === 'not_equals' ? (
              <input
                value={String(filter.value ?? '')}
                onChange={(e) => setFilter({ ...filter, value: e.target.value })}
                placeholder="Value"
                className="rounded border border-zinc-200 px-2 py-1 text-sm outline-none"
              />
            ) : null}
          </>
        )}
        {filter && (
          <button onClick={() => setFilter(null)} className="text-xs text-zinc-400 hover:text-zinc-700">
            Clear
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left dark:border-zinc-800 dark:bg-zinc-900">
              {properties.map((p) => (
                <th key={p.id} className="border-r border-zinc-200 px-2 py-1.5 font-medium dark:border-zinc-800">
                  <button onClick={() => toggleSort(p.id)} className="flex items-center gap-1 text-zinc-700 hover:text-zinc-900">
                    {p.name}
                    {sort?.propertyId === p.id ? (sort.direction === 'asc' ? '↑' : '↓') : ''}
                  </button>
                </th>
              ))}
              <th className="w-10 px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                {properties.map((p) => (
                  <td key={p.id} className="border-r border-zinc-100 px-1 py-0 dark:border-zinc-800">
                    <Cell
                      property={p}
                      value={row.values?.[p.id]}
                      onCommit={(value) => commitCell(row, p, value)}
                    />
                  </td>
                ))}
                <td className="px-2 py-1 text-right">
                  <button
                    onClick={() => api.deleteRow(row.id).then(invalidate)}
                    className="text-xs text-zinc-300 hover:text-red-500"
                    title="Delete row"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={properties.length + 1} className="px-3 py-6 text-center text-zinc-400">
                  No rows yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-2">
        {addingColumn ? (
          <AddColumnForm
            onAdd={(input) => {
              createProperty.mutate(input);
              setAddingColumn(false);
            }}
            onCancel={() => setAddingColumn(false)}
          />
        ) : (
          <div className="flex items-center gap-3">
            <button onClick={() => createRow.mutate()} className="text-zinc-500 hover:text-zinc-900">
              + New row
            </button>
            <button onClick={() => setAddingColumn(true)} className="text-zinc-500 hover:text-zinc-900">
              + New column
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
