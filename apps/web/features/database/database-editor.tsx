'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type {
  CalculationId,
  DatabaseProperty,
  DatabaseRow,
  FilterOperator,
  FilterValue,
  PropertyType,
  ViewConfig,
} from '@/lib/types';
import { applyFilter, applySort, mergeRowValues, normalizeViewConfig, type Filter, type Sort } from './database.lib';
import { BoardView, CalendarView, GalleryView, TableView } from './database-views';
import { PropertyTypeRegistry } from './property-type-registry';
import { RowPeek } from './row-peek';

type ViewType = 'table' | 'board' | 'calendar' | 'gallery';

/**
 * `pageId` drives the full-page database route (unchanged); `databaseId`
 * lets an inline/linked-view editor block (§20C.3) address a database
 * directly, without going through its owner page. Exactly one is passed by
 * any given caller — everything downstream keys off `agg.database.id`
 * either way, so this only changes how the aggregate is first fetched.
 */
export function DatabaseEditor({ pageId, databaseId: databaseIdProp }: { pageId?: string; databaseId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [addingView, setAddingView] = useState(false);
  const [peekRow, setPeekRow] = useState<DatabaseRow | null>(null);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  // Unsaved edits, previewed via `overrides` (§22A.1) while the debounced
  // PATCH to `database_views.config` is in flight — never held as the
  // source of truth, just a preview layer over `activeView.config`.
  const [configOverride, setConfigOverride] = useState<Partial<ViewConfig>>({});

  const pendingConfigRef = useRef<Partial<ViewConfig>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const identityKey = pageId ?? databaseIdProp;
  const { data: agg, isLoading } = useQuery({
    queryKey: ['database', identityKey],
    queryFn: () => (pageId ? api.getDatabase(pageId) : api.getDatabaseById(databaseIdProp!)),
    enabled: !!identityKey,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['database', identityKey] });
    queryClient.invalidateQueries({ queryKey: ['database-query'] });
  };

  const createProperty = useMutation({
    mutationFn: (input: { name: string; type: PropertyType; config?: Record<string, unknown> }) =>
      api.createProperty(agg!.database.id, input),
    onSuccess: invalidate,
  });

  const createRow = useMutation({
    mutationFn: ({ values, templateId }: { values?: Record<string, unknown>; templateId?: string } = {}) =>
      api.createRow(agg!.database.id, values, undefined, templateId),
    onSuccess: invalidate,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['templates', agg?.database.id],
    queryFn: () => api.listTemplates(agg!.database.id),
    enabled: !!agg,
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

  const updateView = useMutation({
    mutationFn: ({ id, config }: { id: string; config: ViewConfig }) => api.updateView(id, { config }),
    onSuccess: invalidate,
  });

  const duplicateView = useMutation({
    mutationFn: (id: string) => api.duplicateView(id),
    onSuccess: (copy) => {
      invalidate();
      setActiveViewId(copy.id);
    },
  });

  // Pointer-drag tab reordering is Sprint 21 — this persists position via move-left/right (§21).
  const moveView = useMutation({
    mutationFn: ({ id, direction }: { id: string; direction: 'left' | 'right' }) => api.moveView(id, direction),
    onSuccess: invalidate,
  });

  const activeView = agg?.views.find((v) => v.id === activeViewId) ?? agg?.views[0];

  // Any unsaved edit for a previous view doesn't leak into the next one.
  useEffect(() => {
    setConfigOverride({});
    pendingConfigRef.current = {};
    setViewMenuOpen(false);
  }, [activeView?.id]);

  const savedConfig = normalizeViewConfig(activeView?.config ?? null);
  const config: ViewConfig = { ...savedConfig, ...configOverride };

  const updateConfig = (patch: Partial<ViewConfig>) => {
    setConfigOverride((prev) => ({ ...prev, ...patch }));
    pendingConfigRef.current = { ...pendingConfigRef.current, ...patch };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (!activeView) return;
      const merged = { ...normalizeViewConfig(activeView.config), ...pendingConfigRef.current };
      pendingConfigRef.current = {};
      updateView.mutate({ id: activeView.id, config: merged });
    }, 400);
  };

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const databaseId = agg?.database.id;
  const configSignature = JSON.stringify(config);

  const queryResult = useInfiniteQuery({
    queryKey: ['database-query', databaseId, activeView?.id, configSignature],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      api.queryDatabase(databaseId!, {
        viewId: activeView!.id,
        overrides: configOverride,
        cursor: pageParam,
        limit: config.pageSize,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!databaseId && !!activeView,
  });

  if (isLoading || !agg || !activeView) {
    return <div className="p-10 text-sm text-zinc-400 dark:text-zinc-500">Loading…</div>;
  }

  const { properties } = agg;
  const pages = queryResult.data?.pages ?? [];
  const serverRows = pages.flatMap((p) => p.rows);
  const calculations = pages[0]?.calculations ?? {};
  const groups = pages[0]?.groups ?? null;
  const total = pages[0]?.total ?? serverRows.length;

  // §22A.2 — the client-side filter/sort overlay only previews an in-flight
  // edit, and only while the whole result set fits on one page; above that,
  // a partial client-side answer is worse than a brief loading state.
  const isPreviewing = queryResult.isFetching && total <= config.pageSize;
  const legacyFilter: Filter | null =
    isPreviewing && config.filter?.rules[0] && !('conjunction' in config.filter.rules[0])
      ? (config.filter.rules[0] as unknown as Filter)
      : null;
  const legacySort: Sort | null = isPreviewing && config.sorts[0] ? config.sorts[0] : null;
  const rows = isPreviewing
    ? applySort(legacyFilter ? applyFilter(serverRows, legacyFilter) : serverRows, legacySort ?? { propertyId: '', direction: 'asc' })
    : serverRows;

  const commitCell = (row: DatabaseRow, property: DatabaseProperty, value: unknown) => {
    if (config.locked) return; // Lock view (§21) — read-only cells.
    updateRow.mutate({ id: row.id, values: mergeRowValues(row, property.id, value) });
  };

  const toggleSort = (propertyId: string) => {
    const current = config.sorts[0];
    if (current?.propertyId === propertyId) {
      updateConfig({ sorts: current.direction === 'asc' ? [{ propertyId, direction: 'desc' }] : [] });
    } else {
      updateConfig({ sorts: [{ propertyId, direction: 'asc' }] });
    }
  };

  const visibleIds = new Set(
    config.properties.filter((p) => p.visible !== false).map((p) => p.propertyId),
  );
  const visibleProperties =
    config.properties.length > 0
      ? properties.filter((p) => visibleIds.has(p.id))
      : properties;

  const addView = (type: ViewType) => {
    let viewConfig: Record<string, unknown> | undefined;
    if (type === 'board') {
      const select = properties.find((p) => p.type === 'select' || p.type === 'status');
      viewConfig = select ? { groupBy: select.id } : {};
    } else if (type === 'calendar') {
      const date = properties.find((p) => p.type === 'date');
      viewConfig = date ? { dateProperty: date.id } : {};
    }
    createView.mutate(
      { name: type.charAt(0).toUpperCase() + type.slice(1), type, config: viewConfig },
      { onSuccess: (view) => setActiveViewId(view.id) },
    );
    setAddingView(false);
  };

  // Side/center/full peek (§20D.6) — 'full' just navigates, no dialog state needed.
  const openRow = (row: DatabaseRow) => {
    const openAs = (config.openAs as 'side' | 'center' | 'full') ?? 'side';
    if (openAs === 'full') {
      if (row.pageId) router.push(`/${row.pageId}`);
      return;
    }
    setPeekRow(row);
  };

  let content: React.ReactNode;
  if (activeView.type === 'table') {
    content = (
      <TableView
        properties={visibleProperties}
        rows={rows}
        sort={config.sorts[0] ?? null}
        toggleSort={toggleSort}
        commitCell={commitCell}
        deleteRow={(id) => deleteRow.mutate(id)}
        createRow={() => createRow.mutate({})}
        createProperty={(input) => createProperty.mutate(input)}
        calculations={calculations}
        selectedCalculations={config.calculations as Record<string, CalculationId>}
        onSetCalculation={(propertyId, calculationId) =>
          updateConfig({
            calculations: calculationId
              ? { ...config.calculations, [propertyId]: calculationId }
              : Object.fromEntries(Object.entries(config.calculations).filter(([id]) => id !== propertyId)),
          })
        }
        rowHeight={(config.rowHeight as 'short' | 'medium' | 'tall') ?? 'short'}
        wrapCells={Boolean(config.wrapCells)}
        onOpenRow={openRow}
      />
    );
  } else if (activeView.type === 'board') {
    const groupableProps = properties.filter((p) => p.type === 'select' || p.type === 'status');
    const groupBy = properties.find((p) => p.id === config.groupBy) ?? groupableProps[0];
    content = groupBy ? (
      <BoardView
        properties={visibleProperties}
        rows={rows}
        groupBy={groupBy}
        groups={groups}
        commitCell={commitCell}
        createRow={(values) => createRow.mutate({ values })}
        onOpenRow={openRow}
      />
    ) : (
      <p className="text-zinc-400 dark:text-zinc-500">Add a “select” or “status” property to use the board view.</p>
    );
  } else if (activeView.type === 'calendar') {
    const dateProps = properties.filter((p) => p.type === 'date');
    const dateProperty = properties.find((p) => p.id === config.dateProperty) ?? dateProps[0];
    content = dateProperty ? (
      <CalendarView properties={visibleProperties} rows={rows} dateProperty={dateProperty} />
    ) : (
      <p className="text-zinc-400 dark:text-zinc-500">Add a “date” property to use the calendar view.</p>
    );
  } else {
    content = (
      <GalleryView
        properties={visibleProperties}
        rows={rows}
        createRow={() => createRow.mutate({})}
        onOpenRow={openRow}
      />
    );
  }

  return (
    <div className="mt-6 text-sm">
      {config.locked && (
        <p className="mb-2 text-xs text-zinc-400">🔒 This view is locked — filter, sort, and columns can't be edited here.</p>
      )}
      {!config.locked && (
        <>
          <FilterBar properties={properties} filter={config.filter} onChange={(filter) => updateConfig({ filter })} />
          <SortBar properties={properties} sorts={config.sorts} onChange={(sorts) => updateConfig({ sorts })} />
        </>
      )}

      {!config.locked && templates.length > 0 && (
        <div className="mb-2 flex items-center gap-1 text-xs text-zinc-500">
          <span>New from template:</span>
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => createRow.mutate({ templateId: t.id })}
              className="rounded border border-zinc-200 px-1.5 py-0.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              {t.icon ?? '📄'} {t.name}
            </button>
          ))}
        </div>
      )}

      {!config.locked && activeView.type === 'table' && (
        <div className="mb-2 flex items-center gap-3 text-xs text-zinc-500">
          <ColumnVisibilityMenu
            properties={properties}
            visible={visibleIds}
            onChange={(next) =>
              updateConfig({
                properties: properties.map((p) => ({ propertyId: p.id, visible: next.has(p.id) })),
              })
            }
          />
          <label className="flex items-center gap-1">
            Row height
            <select
              value={(config.rowHeight as string) ?? 'short'}
              onChange={(e) => updateConfig({ rowHeight: e.target.value })}
              className="rounded border border-zinc-200 bg-transparent px-1 py-0.5 dark:border-zinc-700"
            >
              <option value="short">Short</option>
              <option value="medium">Medium</option>
              <option value="tall">Tall</option>
            </select>
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={Boolean(config.wrapCells)}
              onChange={(e) => updateConfig({ wrapCells: e.target.checked })}
            />
            Wrap cells
          </label>
        </div>
      )}

      {/* View switcher */}
      <div className="mb-2 flex items-center gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {agg.views.map((view) => (
          <div key={view.id} className="group relative flex items-center">
            <button
              onClick={() => setActiveViewId(view.id)}
              className={`px-2 py-1.5 text-sm ${
                view.id === activeView.id
                  ? 'border-b-2 border-zinc-900 font-medium text-zinc-900 dark:border-zinc-100 dark:text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              {view.name}
              {(normalizeViewConfig(view.config) as ViewConfig).locked ? ' 🔒' : ''}
            </button>
            {view.id === activeView.id && (
              <button
                onClick={() => setViewMenuOpen((v) => !v)}
                className="px-1 text-xs text-zinc-300 opacity-0 hover:text-zinc-600 group-hover:opacity-100 dark:hover:text-zinc-300"
                title="View options"
              >
                ⋯
              </button>
            )}
            {view.id === activeView.id && viewMenuOpen && (
              <div className="absolute left-0 top-8 z-50 w-40 rounded border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                <button
                  onClick={() => {
                    duplicateView.mutate(view.id);
                    setViewMenuOpen(false);
                  }}
                  className="block w-full rounded px-2 py-1 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Duplicate
                </button>
                <button
                  onClick={() => moveView.mutate({ id: view.id, direction: 'left' })}
                  className="block w-full rounded px-2 py-1 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Move left
                </button>
                <button
                  onClick={() => moveView.mutate({ id: view.id, direction: 'right' })}
                  className="block w-full rounded px-2 py-1 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Move right
                </button>
                <button
                  onClick={() => {
                    updateConfig({ locked: !config.locked });
                    setViewMenuOpen(false);
                  }}
                  className="block w-full rounded px-2 py-1 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  {config.locked ? 'Unlock view' : 'Lock view'}
                </button>
                {agg.views.length > 1 && (
                  <button
                    onClick={() => {
                      deleteView.mutate(view.id);
                      setViewMenuOpen(false);
                    }}
                    className="block w-full rounded px-2 py-1 text-left text-sm text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    Delete
                  </button>
                )}
              </div>
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

      {queryResult.hasNextPage && (
        <button
          onClick={() => queryResult.fetchNextPage()}
          disabled={queryResult.isFetchingNextPage}
          className="mt-2 text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
        >
          {queryResult.isFetchingNextPage ? 'Loading…' : `Load more (${rows.length} of ${total})`}
        </button>
      )}

      {peekRow && (
        <RowPeek
          row={peekRow}
          properties={properties}
          mode={(config.openAs as 'side' | 'center') ?? 'side'}
          onClose={() => setPeekRow(null)}
        />
      )}
    </div>
  );
}

function FilterBar({
  properties,
  filter,
  onChange,
}: {
  properties: DatabaseProperty[];
  filter: ViewConfig['filter'];
  onChange: (filter: ViewConfig['filter']) => void;
}) {
  const rule = filter?.rules[0] && !('conjunction' in filter.rules[0]) ? filter.rules[0] : null;
  const property = rule ? properties.find((p) => p.id === rule.propertyId) : undefined;
  const operators = property ? PropertyTypeRegistry.get(property.type)?.filterOperators ?? [] : [];

  const setRule = (next: { propertyId: string; operator: FilterOperator; value?: FilterValue } | null) => {
    onChange(next ? { conjunction: 'and', rules: [next] } : null);
  };

  return (
    <div className="mb-2 flex items-center gap-2">
      <select
        value={rule?.propertyId ?? ''}
        onChange={(e) => {
          const p = properties.find((prop) => prop.id === e.target.value);
          const op = p ? PropertyTypeRegistry.get(p.type)?.filterOperators[0] : undefined;
          setRule(e.target.value && op ? { propertyId: e.target.value, operator: op } : null);
        }}
        className="rounded border border-zinc-200 bg-transparent px-2 py-1 text-sm dark:border-zinc-700 dark:text-zinc-100"
      >
        <option value="">No filter</option>
        {properties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {rule && property && (
        <>
          <select
            value={rule.operator}
            onChange={(e) => setRule({ ...rule, operator: e.target.value as FilterOperator })}
            className="rounded border border-zinc-200 bg-transparent px-2 py-1 text-sm dark:border-zinc-700 dark:text-zinc-100"
          >
            {operators.map((op) => (
              <option key={op} value={op}>
                {op.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          {rule.operator !== 'is_empty' && rule.operator !== 'is_not_empty' && (
            <FilterValueInput
              property={property}
              value={rule.value}
              onChange={(value) => setRule({ ...rule, value })}
            />
          )}
        </>
      )}
      {rule && (
        <button onClick={() => setRule(null)} className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
          Clear
        </button>
      )}
    </div>
  );
}

function FilterValueInput({
  property,
  value,
  onChange,
}: {
  property: DatabaseProperty;
  value: FilterValue | undefined;
  onChange: (value: FilterValue | undefined) => void;
}) {
  const cls = 'rounded border border-zinc-200 bg-transparent px-2 py-1 text-sm outline-none dark:border-zinc-700 dark:text-zinc-100';

  if (property.type === 'select' || property.type === 'status') {
    const options = Array.isArray(property.config?.options)
      ? (property.config.options as Array<{ id: string; name: string }>)
      : [];
    return (
      <select value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} className={cls}>
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    );
  }
  if (property.type === 'checkbox') {
    return (
      <select
        value={value === true ? 'true' : 'false'}
        onChange={(e) => onChange(e.target.value === 'true')}
        className={cls}
      >
        <option value="true">Checked</option>
        <option value="false">Unchecked</option>
      </select>
    );
  }
  if (property.type === 'number') {
    return (
      <input
        type="number"
        value={typeof value === 'number' ? value : ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        className={cls}
      />
    );
  }
  if (property.type === 'date') {
    return (
      <input
        type="date"
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        className={cls}
      />
    );
  }
  return (
    <input
      value={String(value ?? '')}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Value"
      className={cls}
    />
  );
}

function SortBar({
  properties,
  sorts,
  onChange,
}: {
  properties: DatabaseProperty[];
  sorts: ViewConfig['sorts'];
  onChange: (sorts: ViewConfig['sorts']) => void;
}) {
  const available = properties.filter((p) => !sorts.some((s) => s.propertyId === p.id));
  if (sorts.length === 0 && available.length === 0) return null;

  return (
    <div className="mb-2 flex flex-wrap items-center gap-1 text-xs">
      {sorts.map((s, i) => {
        const p = properties.find((prop) => prop.id === s.propertyId);
        if (!p) return null;
        return (
          <span key={s.propertyId} className="flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">
            {p.name}
            <button
              onClick={() =>
                onChange(sorts.map((x, j) => (j === i ? { ...x, direction: x.direction === 'asc' ? 'desc' : 'asc' } : x)))
              }
              className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              {s.direction === 'asc' ? '↑' : '↓'}
            </button>
            <button
              onClick={() => onChange(sorts.filter((_, j) => j !== i))}
              className="text-zinc-400 hover:text-red-500"
            >
              ×
            </button>
          </span>
        );
      })}
      {available.length > 0 && sorts.length < 10 && (
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) onChange([...sorts, { propertyId: e.target.value, direction: 'asc' }]);
          }}
          className="rounded border border-zinc-200 bg-transparent px-1 py-0.5 text-zinc-400 dark:border-zinc-700"
        >
          <option value="">+ Sort</option>
          {available.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function ColumnVisibilityMenu({
  properties,
  visible,
  onChange,
}: {
  properties: DatabaseProperty[];
  visible: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="hover:text-zinc-700 dark:hover:text-zinc-200">
        Columns
      </button>
      {open && (
        <div className="absolute left-0 top-6 z-50 w-48 rounded border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {properties.map((p) => {
            const isVisible = visible.size === 0 || visible.has(p.id);
            return (
              <label key={p.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <input
                  type="checkbox"
                  checked={isVisible}
                  onChange={(e) => {
                    const base = visible.size === 0 ? new Set(properties.map((prop) => prop.id)) : new Set(visible);
                    if (e.target.checked) base.add(p.id);
                    else base.delete(p.id);
                    onChange(base);
                  }}
                />
                {p.name}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
