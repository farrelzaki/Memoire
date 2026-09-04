'use client';

import { DndContext, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core';
import { neighborsAfterDrag, useDragSensors } from '@/lib/dnd';
import { SortableContext, useSortable, verticalListSortingStrategy, horizontalListSortingStrategy, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import type {
  CalculationId,
  DatabaseProperty,
  DatabaseQueryGroup,
  DatabaseRow,
  PropertyType,
  RelationConfig,
} from '@/lib/types';
import { cellValue, PropertyTypeRegistry } from './property-type-registry';
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

/**
 * From dnd-kit's `active`/`over` ids after a drag, the sibling ids to send
 * as `beforeId`/`afterId` to a `.../reorder` endpoint (§19A.4, Sprint 21).
 * `orderedIds` is the list's rendered order *before* the drag.
 */
// Promoted to @/lib/dnd in Sprint 22 (the sidebar needs them too, and isn't a database feature).
export { neighborsAfterDrag, useDragSensors };

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
  rowId,
}: {
  property: DatabaseProperty;
  value: unknown;
  onCommit: (value: unknown) => void;
  /** Only needed for `relation` — which row this cell belongs to, to link/unlink against (§23A). */
  rowId?: string;
}) {
  const inputCls = 'w-full bg-transparent px-2 py-1 text-sm outline-none dark:text-zinc-100';
  const readOnlyCls = 'px-2 py-1 text-sm text-zinc-400 dark:text-zinc-500';

  // Materialized server-side (§24A.5, §24B.3) — read-only here, with an
  // #ERROR marker for a formula that failed to evaluate on this row.
  if (property.type === 'formula' || property.type === 'rollup') {
    if (value && typeof value === 'object' && 'error' in (value as Record<string, unknown>)) {
      return (
        <span className={`${readOnlyCls} text-red-500`} title={String((value as { error: unknown }).error)}>
          #ERROR
        </span>
      );
    }
    const def = PropertyTypeRegistry.get(property.type);
    return <span className={readOnlyCls}>{def ? def.toPlainText(value) : ''}</span>;
  }

  if (property.type === 'relation') {
    return <RelationCell property={property} value={value} rowId={rowId} />;
  }

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

/**
 * A relation's linked-row chips plus a picker (§23A) — self-contained
 * (its own query for the target database, its own link/unlink mutations)
 * so it drops into `Cell` without threading row-mutation plumbing through
 * every caller, mirroring `link-to-page-node.tsx`'s search-picker pattern.
 */
function RelationCell({
  property,
  value,
  rowId,
}: {
  property: DatabaseProperty;
  value: unknown;
  rowId?: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const config = property.config as RelationConfig | null;
  const linkedIds = Array.isArray(value) ? (value as string[]) : [];

  const { data: targetAgg } = useQuery({
    queryKey: ['database', config?.targetDatabaseId],
    queryFn: () => api.getDatabaseById(config!.targetDatabaseId),
    enabled: open && !!config?.targetDatabaseId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['database-query'] });
    queryClient.invalidateQueries({ queryKey: ['database'] });
  };

  const titleOf = (id: string) => {
    if (!targetAgg) return id;
    const titleProp = targetAgg.properties.find((p) => p.type === 'title') ?? targetAgg.properties[0];
    const row = targetAgg.rows.find((r) => r.id === id);
    const t = titleProp && row ? row.values?.[titleProp.id] : undefined;
    return typeof t === 'string' && t.length > 0 ? t : 'Untitled';
  };

  const link = (toRowId: string) => {
    if (!rowId) return;
    api.addRelation(rowId, property.id, toRowId).then(invalidate);
    setQuery('');
    setOpen(false);
  };

  const unlink = (toRowId: string) => {
    if (!rowId) return;
    api.removeRelation(rowId, property.id, toRowId).then(invalidate);
  };

  if (!config) return null;

  const titleProp = targetAgg?.properties.find((p) => p.type === 'title') ?? targetAgg?.properties[0];
  const matches = (targetAgg?.rows ?? [])
    .filter((r) => !linkedIds.includes(r.id))
    .filter((r) => {
      const t = titleProp ? r.values?.[titleProp.id] : undefined;
      return typeof t !== 'string' || t.toLowerCase().includes(query.toLowerCase());
    })
    .slice(0, 8);

  return (
    <div className="relative px-1 py-1">
      <div className="flex flex-wrap items-center gap-1">
        {linkedIds.map((id) => (
          <span
            key={id}
            className="flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800"
          >
            {titleOf(id)}
            <button onClick={() => unlink(id)} className="text-zinc-400 hover:text-red-500">
              ×
            </button>
          </span>
        ))}
        {(config.allowMultiple || linkedIds.length === 0) && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            +
          </button>
        )}
      </div>
      {open && (
        <div className="absolute left-0 top-6 z-50 w-56 rounded border border-zinc-200 bg-white p-1.5 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search rows…"
            className="mb-1 w-full bg-transparent text-sm outline-none dark:text-zinc-100"
          />
          <div className="max-h-40 overflow-y-auto">
            {matches.map((r) => (
              <button
                key={r.id}
                onClick={() => link(r.id)}
                className="block w-full rounded px-1.5 py-1 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:text-zinc-100"
              >
                {titleProp && typeof r.values?.[titleProp.id] === 'string' ? (r.values[titleProp.id] as string) : 'Untitled'}
              </button>
            ))}
            {matches.length === 0 && <p className="px-1.5 py-1 text-xs text-zinc-400">No matching rows.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export function AddColumnForm({
  properties = [],
  onAdd,
  onCancel,
}: {
  /** This database's existing properties — only needed for the `rollup` config sub-form (relation/target pickers). */
  properties?: DatabaseProperty[];
  onAdd: (input: { name: string; type: PropertyType; config?: Record<string, unknown> }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<PropertyType>('text');
  const [options, setOptions] = useState('');
  const [targetDatabaseId, setTargetDatabaseId] = useState('');
  const [relationPropertyId, setRelationPropertyId] = useState('');
  const [targetPropertyId, setTargetPropertyId] = useState('');
  const [rollupFunction, setRollupFunction] = useState<string>('sum');
  const [formulaSource, setFormulaSource] = useState('');

  const { data: databases = [] } = useQuery({
    queryKey: ['databases'],
    queryFn: api.listDatabases,
    enabled: type === 'relation',
  });

  const relationProperties = properties.filter((p) => p.type === 'relation');
  const selectedRelation = properties.find((p) => p.id === relationPropertyId);
  const relationTargetId = (selectedRelation?.config as RelationConfig | null)?.targetDatabaseId;
  const { data: relationTargetAgg } = useQuery({
    queryKey: ['database', relationTargetId],
    queryFn: () => api.getDatabaseById(relationTargetId!),
    enabled: type === 'rollup' && !!relationTargetId,
  });

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
    } else if (type === 'relation') {
      if (!targetDatabaseId) return;
      config = { targetDatabaseId, allowMultiple: true, inversePropertyId: null };
    } else if (type === 'rollup') {
      if (!relationPropertyId || !targetPropertyId) return;
      config = { relationPropertyId, targetPropertyId, function: rollupFunction };
    } else if (type === 'formula') {
      if (!formulaSource.trim()) return;
      config = { source: formulaSource };
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
            'relation',
            'rollup',
            'formula',
          ] as const
        ).map((t) => (
          <option key={t} value={t}>
            {PropertyTypeRegistry.get(t)?.label ?? t}
          </option>
        ))}
      </select>
      {type === 'relation' && (
        <select
          value={targetDatabaseId}
          onChange={(e) => setTargetDatabaseId(e.target.value)}
          className="rounded border border-zinc-200 bg-transparent px-2 py-1 text-sm dark:border-zinc-700 dark:text-zinc-100"
        >
          <option value="">Link to database…</option>
          {databases.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      )}
      {type === 'rollup' && (
        <>
          <select
            value={relationPropertyId}
            onChange={(e) => {
              setRelationPropertyId(e.target.value);
              setTargetPropertyId('');
            }}
            className="rounded border border-zinc-200 bg-transparent px-2 py-1 text-sm dark:border-zinc-700 dark:text-zinc-100"
          >
            <option value="">Via relation…</option>
            {relationProperties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {relationPropertyId && (
            <select
              value={targetPropertyId}
              onChange={(e) => setTargetPropertyId(e.target.value)}
              className="rounded border border-zinc-200 bg-transparent px-2 py-1 text-sm dark:border-zinc-700 dark:text-zinc-100"
            >
              <option value="">Property…</option>
              {(relationTargetAgg?.properties ?? [])
                .filter((p) => p.type !== 'rollup') // rollup-of-rollup rejected server-side too (1-hop limit, §24A.5)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          )}
          <select
            value={rollupFunction}
            onChange={(e) => setRollupFunction(e.target.value)}
            className="rounded border border-zinc-200 bg-transparent px-2 py-1 text-sm dark:border-zinc-700 dark:text-zinc-100"
          >
            {ROLLUP_FUNCTIONS.map((fn) => (
              <option key={fn} value={fn}>
                {ROLLUP_FUNCTION_LABELS[fn] ?? fn}
              </option>
            ))}
          </select>
        </>
      )}
      {type === 'formula' && (
        <input
          value={formulaSource}
          onChange={(e) => setFormulaSource(e.target.value)}
          placeholder='prop("Price") * prop("Qty")'
          className="w-56 rounded border border-zinc-200 bg-transparent px-2 py-1 font-mono text-xs outline-none dark:border-zinc-700 dark:text-zinc-100"
        />
      )}
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

/** `CalculationId` + `show_original` (rollup-only, §24B.2) — the same 20 functions as column calculations, plus one. */
const ROLLUP_FUNCTIONS = [
  'show_original',
  'count_all',
  'count_values',
  'count_unique',
  'count_empty',
  'count_not_empty',
  'percent_empty',
  'percent_not_empty',
  'sum',
  'average',
  'median',
  'min',
  'max',
  'range',
  'earliest_date',
  'latest_date',
  'date_range',
  'checked',
  'unchecked',
  'percent_checked',
  'percent_unchecked',
] as const;

const ROLLUP_FUNCTION_LABELS: Record<string, string> = {
  show_original: 'Show original',
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

/** A `<th>` that's both sort-clickable and drag-reorderable, plus a manual (non-dnd-kit) pointer-drag width resize handle on its right edge. */
function SortableColumnHeader({
  property,
  sort,
  toggleSort,
  onResizeColumn,
  width,
}: {
  property: DatabaseProperty;
  sort: Sort | null;
  toggleSort: (id: string) => void;
  onResizeColumn?: (propertyId: string, width: number) => void;
  width?: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: property.id });
  const resizeStart = useRef<{ x: number; width: number } | null>(null);

  const onResizePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeStart.current = { x: e.clientX, width: width ?? 160 };
    const onMove = (ev: PointerEvent) => {
      if (!resizeStart.current) return;
      const next = Math.max(80, resizeStart.current.width + (ev.clientX - resizeStart.current.x));
      onResizeColumn?.(property.id, next);
    };
    const onUp = () => {
      resizeStart.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <th
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        width,
      }}
      className="relative border-r border-zinc-200 px-2 py-1.5 font-medium dark:border-zinc-800"
    >
      <span {...attributes} {...listeners} className="mr-1 cursor-grab text-zinc-300 hover:text-zinc-500" title="Drag to reorder">
        ⠿
      </span>
      <button
        onClick={() => toggleSort(property.id)}
        className="inline-flex items-center gap-1 text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
      >
        {property.name}
        {sort?.propertyId === property.id ? (sort.direction === 'asc' ? '↑' : '↓') : ''}
      </button>
      {onResizeColumn && (
        <div
          onPointerDown={onResizePointerDown}
          className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-300 dark:hover:bg-zinc-600"
        />
      )}
    </th>
  );
}

/** A `<tr>` that's drag-reorderable via a handle cell — disabled while an explicit sort is active, since a manual position write wouldn't visibly move anything under one. */
function SortableRow({
  row,
  dragDisabled,
  children,
}: {
  row: DatabaseRow;
  dragDisabled: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
    disabled: dragDisabled,
  });
  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="group border-b border-zinc-100 last:border-0 dark:border-zinc-800"
    >
      <td className="w-4 px-0.5 text-center">
        {!dragDisabled && (
          <span {...attributes} {...listeners} className="cursor-grab text-xs text-zinc-300 opacity-0 hover:text-zinc-500 group-hover:opacity-100" title="Drag to reorder">
            ⠿
          </span>
        )}
      </td>
      {children}
    </tr>
  );
}

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
  onOpenRow,
  onReorderRow,
  onReorderProperty,
  onResizeColumn,
  columnWidths,
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
  /** Opens the row as a peek/full page per `config.openAs` (§20D.6). */
  onOpenRow?: (row: DatabaseRow) => void;
  /** Drag-drop row/column reorder (§19A.4, Sprint 21) — omit to render without drag handles. */
  onReorderRow?: (id: string, beforeId: string | null, afterId: string | null) => void;
  onReorderProperty?: (id: string, beforeId: string | null, afterId: string | null) => void;
  onResizeColumn?: (propertyId: string, width: number) => void;
  columnWidths?: Record<string, number>;
}) {
  const [addingColumn, setAddingColumn] = useState(false);
  const cellPadY = ROW_HEIGHT_CLASS[rowHeight] ?? ROW_HEIGHT_CLASS.short;
  const dragSensors = useDragSensors();
  const rowIds = rows.map((r) => r.id);
  const propertyIds = properties.map((p) => p.id);
  const rowDragDisabled = sort !== null;

  const onRowDragEnd = (e: DragEndEvent) => {
    if (!onReorderRow || !e.over || e.active.id === e.over.id) return;
    const { beforeId, afterId } = neighborsAfterDrag(rowIds, String(e.active.id), String(e.over.id));
    onReorderRow(String(e.active.id), beforeId, afterId);
  };

  const onColumnDragEnd = (e: DragEndEvent) => {
    if (!onReorderProperty || !e.over || e.active.id === e.over.id) return;
    const { beforeId, afterId } = neighborsAfterDrag(propertyIds, String(e.active.id), String(e.over.id));
    onReorderProperty(String(e.active.id), beforeId, afterId);
  };

  return (
    <div>
      <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left dark:border-zinc-800 dark:bg-zinc-900">
              <th className="w-4" />
              {onOpenRow && <th className="w-6" />}
              {onReorderProperty ? (
                <DndContext sensors={dragSensors} onDragEnd={onColumnDragEnd}>
                  <SortableContext items={propertyIds} strategy={horizontalListSortingStrategy}>
                    {properties.map((p) => (
                      <SortableColumnHeader
                        key={p.id}
                        property={p}
                        sort={sort}
                        toggleSort={toggleSort}
                        onResizeColumn={onResizeColumn}
                        width={columnWidths?.[p.id]}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              ) : (
                properties.map((p) => (
                  <th key={p.id} className="border-r border-zinc-200 px-2 py-1.5 font-medium dark:border-zinc-800" style={{ width: columnWidths?.[p.id] }}>
                    <button
                      onClick={() => toggleSort(p.id)}
                      className="flex items-center gap-1 text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
                    >
                      {p.name}
                      {sort?.propertyId === p.id ? (sort.direction === 'asc' ? '↑' : '↓') : ''}
                    </button>
                  </th>
                ))
              )}
              <th className="w-10 px-2 py-1.5" />
            </tr>
          </thead>
          <DndContext sensors={dragSensors} onDragEnd={onRowDragEnd}>
            <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
              <tbody>
                {rows.map((row) => (
                  <SortableRow key={row.id} row={row} dragDisabled={rowDragDisabled || !onReorderRow}>
                    {onOpenRow && (
                      <td className="w-6 px-0.5 text-center">
                        <button
                          onClick={() => onOpenRow(row)}
                          className="text-xs text-zinc-300 opacity-0 hover:text-zinc-600 group-hover:opacity-100 dark:hover:text-zinc-300"
                          title="Open row"
                        >
                          ⤢
                        </button>
                      </td>
                    )}
                    {properties.map((p) => (
                      <td
                        key={p.id}
                        className={`border-r border-zinc-100 px-1 dark:border-zinc-800 ${cellPadY} ${wrapCells ? 'whitespace-normal break-words' : 'whitespace-nowrap'}`}
                        style={{ width: columnWidths?.[p.id] }}
                      >
                        <Cell
                          property={p}
                          value={cellValue(row, p)}
                          onCommit={(value) => commitCell(row, p, value)}
                          rowId={row.id}
                        />
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
                  </SortableRow>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={properties.length + 2 + (onOpenRow ? 1 : 0)} className="px-3 py-6 text-center text-zinc-400 dark:text-zinc-500">
                      No rows yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </SortableContext>
          </DndContext>
          {calculations && onSetCalculation && (
            <tfoot>
              <tr className="border-t border-zinc-200 bg-zinc-50 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                <td />
                {onOpenRow && <td />}
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
            properties={properties}
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

const EMPTY_GROUP_KEY = '__empty__';

/** Board group/sub-group key (§21A, Sprint 21) — `optionId` alone at the top level, `optionId:subOptionId` when sub-grouped. `null` (no status) maps to `EMPTY_GROUP_KEY`. */
export function boardGroupKey(optionId: string | null, subOptionId?: string | null): string {
  const base = optionId ?? EMPTY_GROUP_KEY;
  return subOptionId === undefined ? base : `${base}:${subOptionId ?? EMPTY_GROUP_KEY}`;
}

function BoardCard({
  row,
  properties,
  groupBy,
  options,
  commitCell,
  onOpenRow,
}: {
  row: DatabaseRow;
  properties: DatabaseProperty[];
  groupBy: DatabaseProperty;
  options: Option[];
  commitCell: CommitCell;
  onOpenRow?: (row: DatabaseRow) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="rounded border border-zinc-200 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
      {...attributes}
      {...listeners}
    >
      <button
        onClick={() => onOpenRow?.(row)}
        className="text-left font-medium text-zinc-800 hover:underline dark:text-zinc-100"
      >
        {rowTitle(properties, row) || 'Untitled'}
      </button>
      {/* Keyboard/accessibility fallback alongside drag (§19A.4) — stop the pointerdown from also arming a drag. */}
      <select
        value={typeof row.values?.[groupBy.id] === 'string' ? (row.values[groupBy.id] as string) : ''}
        onChange={(e) => commitCell(row, groupBy, e.target.value || null)}
        onPointerDown={(e) => e.stopPropagation()}
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
  );
}

/** A board column — droppable (for dropping onto an otherwise-empty column) and, when not collapsed, a `SortableContext` over every row it holds (across sub-groups, so drag order spans sub-group boundaries within one column). */
function BoardColumn({
  columnId,
  title,
  count,
  collapsed,
  onToggleCollapse,
  rowIds,
  onAddCard,
  children,
}: {
  columnId: string;
  title: React.ReactNode;
  count: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  rowIds: string[];
  onAddCard: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId });
  return (
    <div className="w-56 shrink-0 rounded border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
      <button
        onClick={onToggleCollapse}
        className="flex w-full items-center justify-between border-b border-zinc-200 px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400"
      >
        <span className="flex items-center gap-1">
          <span className="text-zinc-400">{collapsed ? '▸' : '▾'}</span>
          {title}
        </span>
        <span>{count}</span>
      </button>
      {!collapsed && (
        <div ref={setNodeRef} className={`flex flex-col gap-1.5 p-1.5 ${isOver ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}>
          <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
            {children}
          </SortableContext>
          <button onClick={onAddCard} className="text-left text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
            + New
          </button>
        </div>
      )}
    </div>
  );
}

export function BoardView({
  properties,
  rows,
  groupBy,
  subGroupBy,
  groups,
  commitCell,
  createRow,
  onOpenRow,
  collapsedGroups = [],
  onToggleCollapse,
  onReorderRow,
  onReorderRowIntoGroup,
}: {
  properties: DatabaseProperty[];
  rows: DatabaseRow[];
  groupBy: DatabaseProperty;
  subGroupBy?: DatabaseProperty;
  groups?: DatabaseQueryGroup[] | null;
  commitCell: CommitCell;
  createRow: (values?: Record<string, unknown>) => void;
  onOpenRow?: (row: DatabaseRow) => void;
  collapsedGroups?: string[];
  onToggleCollapse?: (key: string) => void;
  onReorderRow?: (id: string, beforeId: string | null, afterId: string | null) => void;
  onReorderRowIntoGroup?: (id: string, groupPropertyId: string, groupValue: unknown, beforeId: string | null, afterId: string | null) => void;
}) {
  const options = optionsOf(groupBy);
  const columns = [...options, null];
  const groupsByKey = new Map((groups ?? []).map((g) => [g.key, g]));
  const subOptions = subGroupBy ? optionsOf(subGroupBy) : [];
  const collapsedSet = new Set(collapsedGroups);
  const dragSensors = useDragSensors();

  // columnId (boardGroupKey at the TOP level, ignoring sub-group) -> every row it holds, in render order — the id
  // list a column's SortableContext + cross-column drag detection both key off.
  const rowsByColumn = new Map<string, DatabaseRow[]>();
  for (const option of columns) {
    const optionId = option?.id ?? null;
    const colRows = rows.filter((r) => {
      const v = r.values?.[groupBy.id];
      return optionId === null ? v === null || v === undefined || v === '' : v === optionId;
    });
    rowsByColumn.set(boardGroupKey(optionId), colRows);
  }

  const findColumnOfRow = (rowId: string): string | undefined => {
    for (const [columnId, colRows] of rowsByColumn) {
      if (colRows.some((r) => r.id === rowId)) return columnId;
    }
    return undefined;
  };

  const onDragEnd = (e: DragEndEvent) => {
    if (!onReorderRow || !e.over) return;
    const activeId = String(e.active.id);
    const overId = String(e.over.id);
    if (activeId === overId) return;

    const sourceColumn = findColumnOfRow(activeId);
    const targetColumn = rowsByColumn.has(overId) ? overId : findColumnOfRow(overId);
    if (!sourceColumn || !targetColumn) return;

    if (targetColumn === sourceColumn) {
      const ids = rowsByColumn.get(sourceColumn)!.map((r) => r.id);
      const { beforeId, afterId } = neighborsAfterDrag(ids, activeId, overId);
      onReorderRow(activeId, beforeId, afterId);
      return;
    }

    if (!onReorderRowIntoGroup) return;
    const targetRows = rowsByColumn.get(targetColumn) ?? [];
    const targetOptionId = targetColumn === EMPTY_GROUP_KEY ? null : targetColumn;
    const ids = targetRows.map((r) => r.id);
    const overIsRow = ids.includes(overId);
    const { beforeId, afterId } = overIsRow
      ? neighborsAfterDrag(ids, activeId, overId)
      : { beforeId: ids.length > 0 ? ids[ids.length - 1] : null, afterId: null };
    onReorderRowIntoGroup(activeId, groupBy.id, targetOptionId, beforeId, afterId);
  };

  const board = (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columns.map((option) => {
        const optionId = option?.id ?? null;
        const columnId = boardGroupKey(optionId);
        const colRows = rowsByColumn.get(columnId) ?? [];
        const groupSummary = groupsByKey.get(optionId);
        const columnCollapsed = collapsedSet.has(columnId);

        const subSections = subGroupBy
          ? [...subOptions, null].map((subOption) => {
              const subOptionId = subOption?.id ?? null;
              const subRows = colRows.filter((r) => {
                const v = r.values?.[subGroupBy.id];
                return subOptionId === null ? v === null || v === undefined || v === '' : v === subOptionId;
              });
              return { subOption, subOptionId, subRows, key: boardGroupKey(optionId, subOptionId) };
            })
          : [{ subOption: null, subOptionId: undefined, subRows: colRows, key: columnId }];

        return (
          <BoardColumn
            key={columnId}
            columnId={columnId}
            title={option ? <OptionChip option={option} /> : <span>No status</span>}
            count={groupSummary?.count ?? colRows.length}
            collapsed={columnCollapsed}
            onToggleCollapse={() => onToggleCollapse?.(columnId)}
            rowIds={colRows.map((r) => r.id)}
            onAddCard={() => createRow(optionId ? { [groupBy.id]: optionId } : {})}
          >
            {subSections.map((section) => (
              <div key={section.key}>
                {subGroupBy && (
                  <div className="mb-1 flex items-center justify-between px-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                    <button
                      onClick={() => onToggleCollapse?.(section.key)}
                      className="flex items-center gap-1 hover:text-zinc-600 dark:hover:text-zinc-300"
                    >
                      <span>{collapsedSet.has(section.key) ? '▸' : '▾'}</span>
                      {section.subOption ? <OptionChip option={section.subOption} /> : <span>No {subGroupBy.name}</span>}
                    </button>
                    <span>{section.subRows.length}</span>
                  </div>
                )}
                {!collapsedSet.has(section.key) && (
                  <div className="mb-1.5 flex flex-col gap-1.5">
                    {section.subRows.map((row) => (
                      <BoardCard
                        key={row.id}
                        row={row}
                        properties={properties}
                        groupBy={groupBy}
                        options={options}
                        commitCell={commitCell}
                        onOpenRow={onOpenRow}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </BoardColumn>
        );
      })}
    </div>
  );

  return onReorderRow ? (
    <DndContext sensors={dragSensors} onDragEnd={onDragEnd}>
      {board}
    </DndContext>
  ) : (
    board
  );
}

export function toDateOnly(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseCalendarDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** One event chip — draggable to another day (§21B, Sprint 21). Not sortable: no within-day order, only cross-day. */
function CalendarChip({
  row,
  label,
  resizable,
  onResizeStart,
}: {
  row: DatabaseRow;
  label: string;
  resizable: boolean;
  onResizeStart?: (e: React.PointerEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: row.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`relative mt-0.5 cursor-grab truncate rounded bg-zinc-100 px-1 py-0.5 pr-2 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 ${isDragging ? 'opacity-40' : ''}`}
    >
      {label}
      {resizable && (
        <span
          onPointerDown={(e) => {
            e.stopPropagation();
            onResizeStart?.(e);
          }}
          className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize hover:bg-zinc-300 dark:hover:bg-zinc-600"
        />
      )}
    </div>
  );
}

function CalendarDayCell({
  properties,
  date,
  rows,
  isCurrentMonth,
  onCreateRow,
  resizable,
  onResizeStart,
}: {
  properties: DatabaseProperty[];
  date: Date;
  rows: DatabaseRow[];
  isCurrentMonth: boolean;
  onCreateRow: () => void;
  resizable: boolean;
  onResizeStart?: (row: DatabaseRow, e: React.PointerEvent) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: toDateOnly(date) });
  return (
    <div
      ref={setNodeRef}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCreateRow();
      }}
      className={`min-h-16 cursor-pointer border-b border-r border-zinc-100 p-1 text-xs dark:border-zinc-800 ${
        isOver ? 'bg-zinc-100 dark:bg-zinc-800' : ''
      } ${isCurrentMonth ? '' : 'text-zinc-300 dark:text-zinc-600'}`}
    >
      <div className="pointer-events-none text-zinc-400 dark:text-zinc-500">{date.getDate()}</div>
      {rows.map((row) => (
        <CalendarChip
          key={row.id}
          row={row}
          label={rowTitle(properties, row) || 'Untitled'}
          resizable={resizable}
          onResizeStart={(e) => onResizeStart?.(row, e)}
        />
      ))}
    </div>
  );
}

export function CalendarView({
  properties,
  rows,
  dateProperty,
  endDateProperty,
  span = 'month',
  showWeekends = true,
  commitCell,
  createRow,
  onChangeSpan,
}: {
  properties: DatabaseProperty[];
  rows: DatabaseRow[];
  dateProperty: DatabaseProperty;
  endDateProperty?: DatabaseProperty;
  span?: 'month' | 'week';
  showWeekends?: boolean;
  commitCell?: CommitCell;
  createRow?: (values?: Record<string, unknown>) => void;
  onChangeSpan?: (span: 'month' | 'week') => void;
}) {
  const now = new Date();
  const [anchor, setAnchor] = useState(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const resizeRow = useRef<{ row: DatabaseRow; startX: number; originalEnd: Date } | null>(null);
  const dragSensors = useDragSensors();

  const year = anchor.getFullYear();
  const monthIndex = anchor.getMonth();

  const weekDayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  // `showWeekends` only thins the week view's columns — a month grid stays a
  // full 7 columns so week alignment never has to be recomputed per row.
  const visibleWeekdays = span === 'week' && !showWeekends ? [1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4, 5, 6];

  let days: Array<Date | null>;
  if (span === 'week') {
    const weekStart = new Date(anchor);
    weekStart.setDate(anchor.getDate() - anchor.getDay());
    days = visibleWeekdays.map((offset) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + offset);
      return d;
    });
  } else {
    const totalDays = new Date(year, monthIndex + 1, 0).getDate();
    const startWeekday = new Date(year, monthIndex, 1).getDay();
    const monthDays: Date[] = [];
    for (let d = 1; d <= totalDays; d++) monthDays.push(new Date(year, monthIndex, d));
    days = [...Array(startWeekday).fill(null), ...monthDays];
  }

  const byDay = new Map<string, DatabaseRow[]>();
  for (const row of rows) {
    const start = parseCalendarDate(row.values?.[dateProperty.id]);
    if (!start) continue;
    const end = endDateProperty ? (parseCalendarDate(row.values?.[endDateProperty.id]) ?? start) : start;
    const cursor = new Date(start);
    while (cursor.getTime() <= end.getTime()) {
      const key = toDateOnly(cursor);
      byDay.set(key, [...(byDay.get(key) ?? []), row]);
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  const step = (amount: number) => {
    const next = new Date(anchor);
    if (span === 'week') next.setDate(anchor.getDate() + amount * 7);
    else next.setMonth(anchor.getMonth() + amount);
    setAnchor(next);
  };

  const onResizePointerMove = (e: PointerEvent) => {
    if (!resizeRow.current || !endDateProperty || !commitCell) return;
    const deltaDays = Math.round((e.clientX - resizeRow.current.startX) / 24);
    if (deltaDays === 0) return;
    const nextEnd = new Date(resizeRow.current.originalEnd);
    nextEnd.setDate(nextEnd.getDate() + deltaDays);
    commitCell(resizeRow.current.row, endDateProperty, toDateOnly(nextEnd));
  };
  const onResizePointerUp = () => {
    resizeRow.current = null;
    window.removeEventListener('pointermove', onResizePointerMove);
    window.removeEventListener('pointerup', onResizePointerUp);
  };
  const startResize = (row: DatabaseRow, e: React.PointerEvent) => {
    if (!endDateProperty) return;
    const originalEnd = parseCalendarDate(row.values?.[endDateProperty.id]) ?? parseCalendarDate(row.values?.[dateProperty.id]);
    if (!originalEnd) return;
    resizeRow.current = { row, startX: e.clientX, originalEnd };
    window.addEventListener('pointermove', onResizePointerMove);
    window.addEventListener('pointerup', onResizePointerUp);
  };

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || !commitCell) return;
    const row = rows.find((r) => r.id === String(e.active.id));
    if (!row) return;
    const start = parseCalendarDate(row.values?.[dateProperty.id]);
    const targetDate = new Date(String(e.over.id));
    if (Number.isNaN(targetDate.getTime())) return;
    if (start && sameDay(start, targetDate)) return;

    commitCell(row, dateProperty, toDateOnly(targetDate));
    if (endDateProperty && start) {
      const end = parseCalendarDate(row.values?.[endDateProperty.id]);
      if (end) {
        const durationDays = daysBetween(start, end);
        const newEnd = new Date(targetDate);
        newEnd.setDate(newEnd.getDate() + durationDays);
        commitCell(row, endDateProperty, toDateOnly(newEnd));
      }
    }
  };

  const gridStyle = { display: 'grid', gridTemplateColumns: `repeat(${visibleWeekdays.length}, minmax(0, 1fr))` };
  const grid = (
    <div style={gridStyle}>
      {days.map((date, i) =>
        date === null ? (
          <div key={i} className="min-h-16 border-b border-r border-zinc-100 dark:border-zinc-800" />
        ) : (
          <CalendarDayCell
            key={toDateOnly(date)}
            properties={properties}
            date={date}
            rows={byDay.get(toDateOnly(date)) ?? []}
            isCurrentMonth={span === 'week' || date.getMonth() === monthIndex}
            onCreateRow={() => createRow?.({ [dateProperty.id]: toDateOnly(date) })}
            resizable={Boolean(endDateProperty && commitCell)}
            onResizeStart={startResize}
          />
        ),
      )}
    </div>
  );

  return (
    <div className="overflow-hidden rounded border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <button onClick={() => step(-1)} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          ‹
        </button>
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
          {span === 'week'
            ? `Week of ${anchor.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}`
            : anchor.toLocaleString('en', { month: 'long', year: 'numeric' })}
        </span>
        <div className="flex items-center gap-2">
          {onChangeSpan && (
            <button
              onClick={() => onChangeSpan(span === 'month' ? 'week' : 'month')}
              className="rounded border border-zinc-200 px-1.5 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              {span === 'month' ? 'Week view' : 'Month view'}
            </button>
          )}
          <button onClick={() => step(1)} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            ›
          </button>
        </div>
      </div>
      <div className="border-b border-zinc-200 text-center text-xs text-zinc-400 dark:border-zinc-800" style={gridStyle}>
        {visibleWeekdays.map((w) => (
          <div key={w} className="py-1">
            {weekDayLabels[w]}
          </div>
        ))}
      </div>
      {commitCell ? (
        <DndContext sensors={dragSensors} onDragEnd={onDragEnd}>
          {grid}
        </DndContext>
      ) : (
        grid
      )}
    </div>
  );
}

/** A gallery/list card that's drag-reorderable — shares the same row `position` as every other view (§19A.4). */
function SortableGalleryCard({ id, onClick, children }: { id: string; onClick: () => void; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <button
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      onClick={onClick}
      className="min-h-20 rounded border border-zinc-200 bg-zinc-50 p-3 text-left hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
      {...attributes}
      {...listeners}
    >
      {children}
    </button>
  );
}

export function GalleryView({
  properties,
  rows,
  createRow,
  onOpenRow,
  onReorderRow,
}: {
  properties: DatabaseProperty[];
  rows: DatabaseRow[];
  createRow: () => void;
  onOpenRow?: (row: DatabaseRow) => void;
  onReorderRow?: (id: string, beforeId: string | null, afterId: string | null) => void;
}) {
  const dragSensors = useDragSensors();
  const rowIds = rows.map((r) => r.id);

  const card = (row: DatabaseRow) => (
    <div className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{rowTitle(properties, row) || 'Untitled'}</div>
  );

  const grid = onReorderRow ? (
    <DndContext
      sensors={dragSensors}
      onDragEnd={(e) => {
        if (!e.over || e.active.id === e.over.id) return;
        const { beforeId, afterId } = neighborsAfterDrag(rowIds, String(e.active.id), String(e.over.id));
        onReorderRow(String(e.active.id), beforeId, afterId);
      }}
    >
      <SortableContext items={rowIds} strategy={rectSortingStrategy}>
        {rows.map((row) => (
          <SortableGalleryCard key={row.id} id={row.id} onClick={() => onOpenRow?.(row)}>
            {card(row)}
          </SortableGalleryCard>
        ))}
      </SortableContext>
    </DndContext>
  ) : (
    rows.map((row) => (
      <button
        key={row.id}
        onClick={() => onOpenRow?.(row)}
        className="min-h-20 rounded border border-zinc-200 bg-zinc-50 p-3 text-left hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
      >
        {card(row)}
      </button>
    ))
  );

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {grid}
      <button
        onClick={createRow}
        className="flex min-h-20 items-center justify-center rounded border border-dashed border-zinc-300 text-sm text-zinc-400 hover:border-zinc-400 dark:border-zinc-700"
      >
        + New
      </button>
    </div>
  );
}

/** One row per entry, no column rules — just the title plus a few small properties on the right (§21B.1). */
function SortableListRow({ id, onClick, children }: { id: string; onClick: () => void; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="group flex w-full items-center hover:bg-zinc-50 dark:hover:bg-zinc-900"
    >
      <span {...attributes} {...listeners} className="cursor-grab px-1 text-xs text-zinc-300 opacity-0 hover:text-zinc-500 group-hover:opacity-100" title="Drag to reorder">
        ⠿
      </span>
      <button onClick={onClick} className="flex w-full items-center justify-between px-1 py-2 text-left">
        {children}
      </button>
    </div>
  );
}

/** One row per entry, no column rules — just the title plus a few small properties on the right (§21B.1). */
export function ListView({
  properties,
  rows,
  createRow,
  onOpenRow,
  onReorderRow,
}: {
  properties: DatabaseProperty[];
  rows: DatabaseRow[];
  createRow: () => void;
  onOpenRow?: (row: DatabaseRow) => void;
  onReorderRow?: (id: string, beforeId: string | null, afterId: string | null) => void;
}) {
  const title = titleProperty(properties);
  const rest = properties.filter((p) => p.id !== title?.id).slice(0, 3);
  const dragSensors = useDragSensors();
  const rowIds = rows.map((r) => r.id);

  const rowContent = (row: DatabaseRow) => (
    <>
      <span className="truncate font-medium text-zinc-800 dark:text-zinc-100">{rowTitle(properties, row) || 'Untitled'}</span>
      <span className="flex shrink-0 items-center gap-2 text-xs text-zinc-400">
        {rest.map((p) => (
          <span key={p.id}>{PropertyTypeRegistry.get(p.type)?.toPlainText(cellValue(row, p))}</span>
        ))}
      </span>
    </>
  );

  const list = onReorderRow ? (
    <DndContext
      sensors={dragSensors}
      onDragEnd={(e) => {
        if (!e.over || e.active.id === e.over.id) return;
        const { beforeId, afterId } = neighborsAfterDrag(rowIds, String(e.active.id), String(e.over.id));
        onReorderRow(String(e.active.id), beforeId, afterId);
      }}
    >
      <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
        {rows.map((row) => (
          <SortableListRow key={row.id} id={row.id} onClick={() => onOpenRow?.(row)}>
            {rowContent(row)}
          </SortableListRow>
        ))}
      </SortableContext>
    </DndContext>
  ) : (
    rows.map((row) => (
      <button
        key={row.id}
        onClick={() => onOpenRow?.(row)}
        className="flex w-full items-center justify-between px-2 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900"
      >
        {rowContent(row)}
      </button>
    ))
  );

  return (
    <div className="divide-y divide-zinc-100 rounded border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      {list}
      {rows.length === 0 && <p className="px-2 py-6 text-center text-zinc-400 dark:text-zinc-500">No rows yet.</p>}
      <button onClick={createRow} className="block w-full px-2 py-2 text-left text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
        + New
      </button>
    </div>
  );
}

const ZOOM_PX_PER_DAY: Record<string, number> = { day: 32, week: 12, month: 4, quarter: 1.5, year: 0.4 };

function parseDateOnly(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * Gantt-style timeline (§21B.2) — one horizontal bar per row, positioned by
 * `startProperty`/`endProperty`. No dependency lines between bars (explicitly
 * out of scope, §21B.2) and no bar-to-bar order, so bars aren't draggable
 * into a list order — only along the time axis (wired in a later pass).
 */
export function TimelineView({
  properties,
  rows,
  startProperty,
  endProperty,
  zoom,
  showTable,
  onOpenRow,
}: {
  properties: DatabaseProperty[];
  rows: DatabaseRow[];
  startProperty: DatabaseProperty;
  endProperty?: DatabaseProperty;
  zoom: 'day' | 'week' | 'month' | 'quarter' | 'year';
  showTable: boolean;
  onOpenRow?: (row: DatabaseRow) => void;
}) {
  const pxPerDay = ZOOM_PX_PER_DAY[zoom] ?? ZOOM_PX_PER_DAY.week;

  const bars = rows
    .map((row) => {
      const start = parseDateOnly(row.values?.[startProperty.id]);
      if (!start) return null;
      const end = endProperty ? parseDateOnly(row.values?.[endProperty.id]) : null;
      return { row, start, end: end ?? start };
    })
    .filter((b): b is { row: DatabaseRow; start: Date; end: Date } => b !== null);

  if (bars.length === 0) {
    return <p className="text-zinc-400 dark:text-zinc-500">No rows with a {startProperty.name} value yet.</p>;
  }

  const rangeStart = new Date(Math.min(...bars.map((b) => b.start.getTime())));

  return (
    <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
      <div className="flex">
        {showTable && (
          <div className="w-40 shrink-0 border-r border-zinc-200 dark:border-zinc-800">
            {bars.map(({ row }) => (
              <button
                key={row.id}
                onClick={() => onOpenRow?.(row)}
                className="block w-full truncate px-2 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
                style={{ height: 40 }}
              >
                {rowTitle(properties, row) || 'Untitled'}
              </button>
            ))}
          </div>
        )}
        <div className="relative flex-1">
          {bars.map(({ row, start, end }) => {
            const left = daysBetween(rangeStart, start) * pxPerDay;
            const durationDays = Math.max(1, daysBetween(start, end) + 1);
            const width = durationDays * pxPerDay;
            return (
              <div key={row.id} className="relative border-b border-zinc-100 dark:border-zinc-800" style={{ height: 40 }}>
                <button
                  onClick={() => onOpenRow?.(row)}
                  title={rowTitle(properties, row)}
                  className="absolute top-1.5 h-7 truncate rounded bg-zinc-700 px-2 text-left text-xs text-white hover:bg-zinc-600 dark:bg-zinc-300 dark:text-zinc-900"
                  style={{ left, width: Math.max(width, 24) }}
                >
                  {rowTitle(properties, row) || 'Untitled'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
