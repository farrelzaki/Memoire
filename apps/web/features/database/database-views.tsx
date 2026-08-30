'use client';

import { useState } from 'react';
import type { DatabaseProperty, DatabaseRow, PropertyType } from '@/lib/types';
import type { Sort } from './database.lib';

type CommitCell = (row: DatabaseRow, property: DatabaseProperty, value: unknown) => void;

export function titleProperty(properties: DatabaseProperty[]): DatabaseProperty | undefined {
  return properties.find((p) => p.type === 'title') ?? properties[0];
}

export function rowTitle(properties: DatabaseProperty[], row: DatabaseRow): string {
  const p = titleProperty(properties);
  if (!p) return '';
  const v = row.values?.[p.id];
  return typeof v === 'string' ? v : '';
}

export function Cell({
  property,
  value,
  onCommit,
}: {
  property: DatabaseProperty;
  value: unknown;
  onCommit: (value: unknown) => void;
}) {
  const inputCls = 'w-full bg-transparent px-2 py-1 text-sm outline-none dark:text-zinc-100';

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

export function AddColumnForm({
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
    <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 p-2 dark:border-zinc-800">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Column name"
        className="rounded border border-zinc-200 bg-transparent px-2 py-1 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:text-zinc-100"
      />
      <select
        value={type}
        onChange={(e) => setType(e.target.value as PropertyType)}
        className="rounded border border-zinc-200 bg-transparent px-2 py-1 text-sm dark:border-zinc-700 dark:text-zinc-100"
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
          className="rounded border border-zinc-200 bg-transparent px-2 py-1 text-sm outline-none dark:border-zinc-700 dark:text-zinc-100"
        />
      )}
      <button
        onClick={submit}
        className="rounded bg-zinc-900 px-2 py-1 text-sm text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
      >
        Add
      </button>
      <button onClick={onCancel} className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
        Cancel
      </button>
    </div>
  );
}

export function TableView({
  properties,
  rows,
  sort,
  toggleSort,
  commitCell,
  deleteRow,
  createRow,
  createProperty,
}: {
  properties: DatabaseProperty[];
  rows: DatabaseRow[];
  sort: Sort | null;
  toggleSort: (id: string) => void;
  commitCell: CommitCell;
  deleteRow: (id: string) => void;
  createRow: () => void;
  createProperty: (input: { name: string; type: PropertyType; config?: Record<string, unknown> }) => void;
}) {
  const [addingColumn, setAddingColumn] = useState(false);

  return (
    <div>
      <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left dark:border-zinc-800 dark:bg-zinc-900">
              {properties.map((p) => (
                <th key={p.id} className="border-r border-zinc-200 px-2 py-1.5 font-medium dark:border-zinc-800">
                  <button
                    onClick={() => toggleSort(p.id)}
                    className="flex items-center gap-1 text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
                  >
                    {p.name}
                    {sort?.propertyId === p.id ? (sort.direction === 'asc' ? '↑' : '↓') : ''}
                  </button>
                </th>
              ))}
              <th className="w-10 px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                {properties.map((p) => (
                  <td key={p.id} className="border-r border-zinc-100 px-1 py-0 dark:border-zinc-800">
                    <Cell property={p} value={row.values?.[p.id]} onCommit={(value) => commitCell(row, p, value)} />
                  </td>
                ))}
                <td className="px-2 py-1 text-right">
                  <button
                    onClick={() => deleteRow(row.id)}
                    className="text-xs text-zinc-300 hover:text-red-500"
                    title="Delete row"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={properties.length + 1} className="px-3 py-6 text-center text-zinc-400 dark:text-zinc-500">
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
              createProperty(input);
              setAddingColumn(false);
            }}
            onCancel={() => setAddingColumn(false)}
          />
        ) : (
          <div className="flex items-center gap-3">
            <button onClick={createRow} className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
              + New row
            </button>
            <button onClick={() => setAddingColumn(true)} className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
              + New column
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function BoardView({
  properties,
  rows,
  groupBy,
  commitCell,
  createRow,
}: {
  properties: DatabaseProperty[];
  rows: DatabaseRow[];
  groupBy: DatabaseProperty;
  commitCell: CommitCell;
  createRow: (values?: Record<string, unknown>) => void;
}) {
  const options = Array.isArray(groupBy.config?.options)
    ? (groupBy.config.options as string[])
    : [];
  const columns = [...options, ''];

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columns.map((option) => {
        const colRows = rows.filter((r) => {
          const v = r.values?.[groupBy.id];
          return option === '' ? v === null || v === undefined || v === '' : v === option;
        });
        return (
          <div
            key={option || '__empty__'}
            className="w-56 shrink-0 rounded border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="border-b border-zinc-200 px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              {option || 'No status'}
            </div>
            <div className="flex flex-col gap-1.5 p-1.5">
              {colRows.map((row) => (
                <div key={row.id} className="rounded border border-zinc-200 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-800">
                  <div className="font-medium text-zinc-800 dark:text-zinc-100">
                    {rowTitle(properties, row) || 'Untitled'}
                  </div>
                  <select
                    value={typeof row.values?.[groupBy.id] === 'string' ? (row.values[groupBy.id] as string) : ''}
                    onChange={(e) => commitCell(row, groupBy, e.target.value)}
                    className="mt-1 w-full rounded border border-zinc-200 bg-transparent px-1 py-0.5 text-xs text-zinc-600 dark:border-zinc-600 dark:text-zinc-300"
                  >
                    <option value="">—</option>
                    {options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <button
                onClick={() => createRow(option ? { [groupBy.id]: option } : {})}
                className="text-left text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                + New
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CalendarView({
  properties,
  rows,
  dateProperty,
}: {
  properties: DatabaseProperty[];
  rows: DatabaseRow[];
  dateProperty: DatabaseProperty;
}) {
  const now = new Date();
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const totalDays = new Date(year, monthIndex + 1, 0).getDate();
  const startWeekday = new Date(year, monthIndex, 1).getDay();

  const byDay = new Map<number, DatabaseRow[]>();
  for (const row of rows) {
    const v = row.values?.[dateProperty.id];
    if (typeof v !== 'string') continue;
    const d = new Date(v);
    if (d.getFullYear() === year && d.getMonth() === monthIndex) {
      const day = d.getDate();
      byDay.set(day, [...(byDay.get(day) ?? []), row]);
    }
  }

  const cells: Array<number | null> = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);

  return (
    <div className="overflow-hidden rounded border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <button
          onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}
          className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ‹
        </button>
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
          {month.toLocaleString('en', { month: 'long', year: 'numeric' })}
        </span>
        <button
          onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}
          className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 border-b border-zinc-200 text-center text-xs text-zinc-400 dark:border-zinc-800">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => (
          <div
            key={i}
            className="min-h-16 border-b border-r border-zinc-100 p-1 text-xs dark:border-zinc-800"
          >
            {day !== null && (
              <>
                <div className="text-zinc-400 dark:text-zinc-500">{day}</div>
                {(byDay.get(day) ?? []).map((row) => (
                  <div
                    key={row.id}
                    className="mt-0.5 truncate rounded bg-zinc-100 px-1 py-0.5 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    {rowTitle(properties, row)}
                  </div>
                ))}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function GalleryView({
  properties,
  rows,
  createRow,
}: {
  properties: DatabaseProperty[];
  rows: DatabaseRow[];
  createRow: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {rows.map((row) => (
        <div
          key={row.id}
          className="min-h-20 rounded border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
            {rowTitle(properties, row) || 'Untitled'}
          </div>
        </div>
      ))}
      <button
        onClick={createRow}
        className="flex min-h-20 items-center justify-center rounded border border-dashed border-zinc-300 text-sm text-zinc-400 hover:border-zinc-400 dark:border-zinc-700"
      >
        + New
      </button>
    </div>
  );
}
