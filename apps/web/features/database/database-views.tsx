'use client';

import { useState } from 'react';
import type { CalculationId, DatabaseProperty, DatabaseQueryGroup, DatabaseRow, PropertyType } from '@/lib/types';
import { PropertyTypeRegistry } from './property-type-registry';
import type { Sort } from './database.lib';

type CommitCell = (row: DatabaseRow, property: DatabaseProperty, value: unknown) => void;

type Option = { id: string; name: string; color: string };

const OPTION_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#0ea5e9', '#6366f1', '#a855f7', '#ec4899'];

function optionsOf(property: DatabaseProperty): Option[] {
  const options = property.config?.options;
  return Array.isArray(options) ? (options as Option[]) : [];
}

function newOption(name: string, index: number): Option {
  return { id: crypto.randomUUID(), name, color: OPTION_COLORS[index % OPTION_COLORS.length] };
}

export function titleProperty(properties: DatabaseProperty[]): DatabaseProperty | undefined {
  return properties.find((p) => p.type === 'title') ?? properties[0];
}

export function rowTitle(properties: DatabaseProperty[], row: DatabaseRow): string {
  const p = titleProperty(properties);
  if (!p) return '';
  const v = row.values?.[p.id];
  return typeof v === 'string' ? v : '';
}

function OptionChip({ option }: { option: Option }) {
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-xs"
      style={{ backgroundColor: `${option.color}22`, color: option.color }}
    >
      {option.name}
    </span>
  );
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
  const readOnlyCls = 'px-2 py-1 text-sm text-zinc-400 dark:text-zinc-500';

  if (!PropertyTypeRegistry.get(property.type)?.editable) {
    // created_time, last_edited_time, unique_id (§20A.4) — server-derived, never editable here.
    if (property.type === 'unique_id') {
      const prefix = typeof property.config?.prefix === 'string' ? property.config.prefix : '';
      return <span className={readOnlyCls}>{typeof value === 'number' ? `${prefix}${value}` : ''}</span>;
    }
    return <span className={readOnlyCls}>{typeof value === 'string' ? new Date(value).toLocaleString() : ''}</span>;
  }

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
    case 'select':
    case 'status': {
      const options = optionsOf(property);
      const current = typeof value === 'string' ? value : '';
      return (
        <select value={current} onChange={(e) => onCommit(e.target.value || null)} className={inputCls}>
          <option value="">—</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      );
    }
    case 'multi_select': {
      const options = optionsOf(property);
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap items-center gap-1 px-1 py-1">
          {selected.map((id) => {
            const option = options.find((o) => o.id === id);
            return option ? <OptionChip key={id} option={option} /> : null;
          })}
          <select
            value=""
            onChange={(e) => {
              if (e.target.value && !selected.includes(e.target.value)) onCommit([...selected, e.target.value]);
            }}
            className="bg-transparent text-xs text-zinc-400 outline-none"
          >
            <option value="">+</option>
            {options
              .filter((o) => !selected.includes(o.id))
              .map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
          </select>
        </div>
      );
    }
    case 'files':
      return (
        <span className={readOnlyCls}>{Array.isArray(value) ? `${value.length} file(s)` : 'No files'}</span>
      );
    default:
      return (
        <input
          type={property.type === 'url' ? 'url' : property.type === 'email' ? 'email' : property.type === 'phone' ? 'tel' : 'text'}
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
    let config: Record<string, unknown> | undefined;
    if (type === 'select' || type === 'multi_select') {
      const names = options.split(',').map((s) => s.trim()).filter(Boolean);
      config = { options: names.map((n, i) => newOption(n, i)) };
    } else if (type === 'status') {
      const groups = ['todo', 'doing', 'done'] as const;
      const names = options.split(',').map((s) => s.trim()).filter(Boolean);
      const defaultNames = names.length > 0 ? names : ['To-do', 'In progress', 'Complete'];
      config = {
        options: defaultNames.map((n, i) => ({ ...newOption(n, i), group: groups[i % groups.length] })),
      };
    }
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
        {(
          [
            'title',
            'text',
            'number',
            'select',
            'multi_select',
            'status',
            'checkbox',
            'date',
            'url',
            'email',
            'phone',
            'files',
            'created_time',
            'last_edited_time',
            'unique_id',
          ] as const
        ).map((t) => (
          <option key={t} value={t}>
            {PropertyTypeRegistry.get(t)?.label ?? t}
          </option>
        ))}
      </select>
      {(type === 'select' || type === 'multi_select' || type === 'status') && (
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

const ROW_HEIGHT_CLASS: Record<string, string> = { short: 'py-0', medium: 'py-1.5', tall: 'py-3' };

const CALCULATION_LABELS: Record<CalculationId, string> = {
  count_all: 'Count all',
  count_values: 'Count values',
  count_unique: 'Count unique',
  count_empty: 'Count empty',
  count_not_empty: 'Count not empty',
  percent_empty: '% empty',
  percent_not_empty: '% not empty',
  sum: 'Sum',
  average: 'Average',
  median: 'Median',
  min: 'Min',
  max: 'Max',
  range: 'Range',
  earliest_date: 'Earliest date',
  latest_date: 'Latest date',
  date_range: 'Date range',
  checked: 'Checked',
  unchecked: 'Unchecked',
  percent_checked: '% checked',
  percent_unchecked: '% unchecked',
};

function formatCalculation(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (typeof value === 'string' && !Number.isNaN(Number(value))) return formatCalculation(Number(value));
  return String(value);
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
  calculations,
  selectedCalculations,
  onSetCalculation,
  rowHeight = 'short',
  wrapCells = false,
}: {
  properties: DatabaseProperty[];
  rows: DatabaseRow[];
  sort: Sort | null;
  toggleSort: (id: string) => void;
  commitCell: CommitCell;
  deleteRow: (id: string) => void;
  createRow: () => void;
  createProperty: (input: { name: string; type: PropertyType; config?: Record<string, unknown> }) => void;
  /** Computed values from the query result (§20B.2), keyed by propertyId. */
  calculations?: Record<string, unknown>;
  /** Which function is configured per column (`view.config.calculations`). */
  selectedCalculations?: Record<string, CalculationId>;
  onSetCalculation?: (propertyId: string, calculationId: CalculationId | null) => void;
  rowHeight?: 'short' | 'medium' | 'tall';
  wrapCells?: boolean;
}) {
  const [addingColumn, setAddingColumn] = useState(false);
  const cellPadY = ROW_HEIGHT_CLASS[rowHeight] ?? ROW_HEIGHT_CLASS.short;

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
                  <td
                    key={p.id}
                    className={`border-r border-zinc-100 px-1 dark:border-zinc-800 ${cellPadY} ${wrapCells ? 'whitespace-normal break-words' : 'whitespace-nowrap'}`}
                  >
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
          {calculations && onSetCalculation && (
            <tfoot>
              <tr className="border-t border-zinc-200 bg-zinc-50 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                {properties.map((p) => {
                  const available = PropertyTypeRegistry.get(p.type)?.calculations ?? [];
                  const current = selectedCalculations?.[p.id];
                  return (
                    <td key={p.id} className="border-r border-zinc-100 px-1 py-1 dark:border-zinc-800">
                      <select
                        value={current ?? ''}
                        onChange={(e) => onSetCalculation(p.id, (e.target.value || null) as CalculationId | null)}
                        className="w-full bg-transparent text-xs text-zinc-400 outline-none"
                      >
                        <option value="">Calculate</option>
                        {available.map((c) => (
                          <option key={c} value={c}>
                            {CALCULATION_LABELS[c]}
                          </option>
                        ))}
                      </select>
                      {current && <div className="px-1 font-medium text-zinc-600 dark:text-zinc-300">{formatCalculation(calculations[p.id])}</div>}
                    </td>
                  );
                })}
                <td />
              </tr>
            </tfoot>
          )}
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
  groups,
  commitCell,
  createRow,
}: {
  properties: DatabaseProperty[];
  rows: DatabaseRow[];
  groupBy: DatabaseProperty;
  groups?: DatabaseQueryGroup[] | null;
  commitCell: CommitCell;
  createRow: (values?: Record<string, unknown>) => void;
}) {
  const options = optionsOf(groupBy);
  const columns = [...options, null];
  const groupsByKey = new Map((groups ?? []).map((g) => [g.key, g]));

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columns.map((option) => {
        const optionId = option?.id ?? null;
        const colRows = rows.filter((r) => {
          const v = r.values?.[groupBy.id];
          return optionId === null ? v === null || v === undefined || v === '' : v === optionId;
        });
        const groupSummary = groupsByKey.get(optionId);

        return (
          <div
            key={optionId ?? '__empty__'}
            className="w-56 shrink-0 rounded border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <span>{option ? <OptionChip option={option} /> : 'No status'}</span>
              <span>{groupSummary?.count ?? colRows.length}</span>
            </div>
            <div className="flex flex-col gap-1.5 p-1.5">
              {colRows.map((row) => (
                <div key={row.id} className="rounded border border-zinc-200 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-800">
                  <div className="font-medium text-zinc-800 dark:text-zinc-100">
                    {rowTitle(properties, row) || 'Untitled'}
                  </div>
                  <select
                    value={typeof row.values?.[groupBy.id] === 'string' ? (row.values[groupBy.id] as string) : ''}
                    onChange={(e) => commitCell(row, groupBy, e.target.value || null)}
                    className="mt-1 w-full rounded border border-zinc-200 bg-transparent px-1 py-0.5 text-xs text-zinc-600 dark:border-zinc-600 dark:text-zinc-300"
                  >
                    <option value="">—</option>
                    {options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <button
                onClick={() => createRow(optionId ? { [groupBy.id]: optionId } : {})}
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
