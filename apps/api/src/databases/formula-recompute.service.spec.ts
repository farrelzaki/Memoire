import { describe, expect, it, vi } from 'vitest';
import type { DrizzleTx } from '../db/drizzle.provider';
import type { DatabaseProperty, DatabaseRow } from '../db/schema';
import type { FormulaGraphService } from './formula-graph.service';
import { FormulaRecomputeService } from './formula-recompute.service';

/** Minimal fake matching the `tx.select().from().where()` / `tx.update().set().where().returning()` chains this service uses. */
function fakeTx(selectResults: unknown[][]): { tx: DrizzleTx; updates: Record<string, unknown>[] } {
  let selectIdx = 0;
  const updates: Record<string, unknown>[] = [];
  const tx = {
    select: () => ({
      from: () => ({
        where: async () => selectResults[selectIdx++] ?? [],
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updates.push(values);
        return {
          where: () => ({
            returning: async () => [{ ...values, id: 'row-1' }],
          }),
        };
      },
    }),
  } as unknown as DrizzleTx;
  return { tx, updates };
}

function fakeGraph(order: string[]): FormulaGraphService {
  return { topoOrder: vi.fn().mockResolvedValue(order) } as unknown as FormulaGraphService;
}

function row(overrides: Partial<DatabaseRow> = {}): DatabaseRow {
  return {
    id: 'row-1',
    databaseId: 'db-1',
    pageId: null,
    values: {},
    position: 0,
    uniqueIdSeq: null,
    isArchived: false,
    computed: {},
    computedAt: null,
    ...overrides,
  } as DatabaseRow;
}

function formulaProperty(id: string, source: string, ast: unknown): DatabaseProperty {
  return {
    id,
    name: id,
    databaseId: 'db-1',
    position: 0,
    type: 'formula',
    config: { source, ast, volatile: false, returnType: 'unknown' },
  } as DatabaseProperty;
}

function rollupProperty(id: string, relationPropertyId: string, targetPropertyId: string, fn: string): DatabaseProperty {
  return {
    id,
    name: id,
    databaseId: 'db-1',
    position: 0,
    type: 'rollup',
    config: { relationPropertyId, targetPropertyId, function: fn },
  } as DatabaseProperty;
}

describe('FormulaRecomputeService.recomputeRow', () => {
  it('evaluates a formula against row.values and writes it to computed', async () => {
    const graph = fakeGraph(['total']);
    const service = new FormulaRecomputeService({} as never, graph, {} as never);
    const { tx, updates } = fakeTx([]);

    const ast = {
      type: 'binary',
      op: '+',
      left: { type: 'prop', propertyId: 'price', propertyName: 'Price' },
      right: { type: 'literal', value: 1 },
    };
    const properties = [formulaProperty('total', 'prop("Price") + 1', ast)];
    const r = row({ values: { price: 41 } });

    const result = await service.recomputeRow(tx, 'db-1', r, properties);

    expect(result.computed).toEqual({ total: 42 });
    expect(updates[0].computed).toEqual({ total: 42 });
  });

  it('resolves a formula that reads another formula result, in topo order', async () => {
    const graph = fakeGraph(['a', 'b']); // a before b
    const service = new FormulaRecomputeService({} as never, graph, {} as never);
    const { tx } = fakeTx([]);

    const aAst = { type: 'literal', value: 10 };
    const bAst = { type: 'binary', op: '+', left: { type: 'prop', propertyId: 'a', propertyName: 'A' }, right: { type: 'literal', value: 5 } };
    const properties = [formulaProperty('a', '10', aAst), formulaProperty('b', 'prop("A") + 5', bAst)];

    const result = await service.recomputeRow(tx, 'db-1', row(), properties);

    expect(result.computed).toEqual({ a: 10, b: 15 });
  });

  it('stores an error marker instead of throwing when a formula evaluation fails', async () => {
    const graph = fakeGraph(['bad']);
    const service = new FormulaRecomputeService({} as never, graph, {} as never);
    const { tx } = fakeTx([]);

    const ast = { type: 'binary', op: '/', left: { type: 'literal', value: 1 }, right: { type: 'literal', value: 0 } };
    const properties = [formulaProperty('bad', '1/0', ast)];

    const result = await service.recomputeRow(tx, 'db-1', row(), properties);

    expect(result.computed.bad).toHaveProperty('error');
  });

  it('aggregates a rollup by fetching linked rows via database_relation_links', async () => {
    const graph = fakeGraph(['hours']);
    const service = new FormulaRecomputeService({} as never, graph, {} as never);
    // 1st select: relation links (to_row_id list); 2nd select: the related rows themselves
    const { tx } = fakeTx([
      [{ toRowId: 'task-1' }, { toRowId: 'task-2' }],
      [
        { id: 'task-1', values: { hours: 3 }, computed: {} },
        { id: 'task-2', values: { hours: 4 }, computed: {} },
      ],
    ]);
    const properties = [rollupProperty('hours', 'tasks-relation', 'hours', 'sum')];

    const result = await service.recomputeRow(tx, 'db-1', row(), properties);

    expect(result.computed).toEqual({ hours: 7 });
  });

  it('rollup falls back to the empty aggregate when there are no linked rows', async () => {
    const graph = fakeGraph(['hours']);
    const service = new FormulaRecomputeService({} as never, graph, {} as never);
    const { tx } = fakeTx([[]]);
    const properties = [rollupProperty('hours', 'tasks-relation', 'hours', 'sum')];

    const result = await service.recomputeRow(tx, 'db-1', row(), properties);

    expect(result.computed).toEqual({ hours: 0 });
  });

  it('never materializes a volatile formula, and drops a stale value left from before it became volatile', async () => {
    const graph = fakeGraph(['today_flag']);
    const service = new FormulaRecomputeService({} as never, graph, {} as never);
    const { tx } = fakeTx([]);

    const property = {
      id: 'today_flag',
      name: 'today_flag',
      databaseId: 'db-1',
      position: 0,
      type: 'formula',
      config: { source: 'today()', ast: { type: 'call', name: 'today', args: [] }, volatile: true, returnType: 'date' },
    } as DatabaseProperty;
    const r = row({ computed: { today_flag: '2026-01-01' } });

    const result = await service.recomputeRow(tx, 'db-1', r, [property]);

    expect(result.computed).toEqual({});
  });
});

describe('FormulaRecomputeService.recomputeDependents', () => {
  it('recomputes rows on the other side of a relation link, 1 hop', async () => {
    const graph = fakeGraph(['total']);
    const service = new FormulaRecomputeService({} as never, graph, {} as never);
    const ast = { type: 'literal', value: 99 };
    const dependentProperties = [formulaProperty('total', '99', ast)];

    const { tx } = fakeTx([
      [{ fromRowId: 'proj-1' }], // links pointing at changed row
      [{ id: 'proj-1', databaseId: 'db-projects', values: {}, computed: {} }], // dependent rows
      dependentProperties, // properties of db-projects
    ]);

    await service.recomputeDependents(tx, 'task-1', ['relation-prop']);

    // recomputeRow was invoked on proj-1 with its own graph lookup (topoOrder mocked to ['total'])
    expect(graph.topoOrder).toHaveBeenCalled();
  });

  it('does nothing when there are no relation property ids to check', async () => {
    const graph = fakeGraph([]);
    const service = new FormulaRecomputeService({} as never, graph, {} as never);
    const { tx } = fakeTx([]);

    await service.recomputeDependents(tx, 'task-1', []);

    expect(graph.topoOrder).not.toHaveBeenCalled();
  });
});

describe('FormulaRecomputeService.recomputeDatabaseAsync', () => {
  it('registers a one-shot timeout via SchedulerRegistry instead of blocking the caller', () => {
    vi.useFakeTimers(); // never let the real 0ms timeout fire against a fake db
    try {
      const graph = fakeGraph([]);
      const scheduler = { addTimeout: vi.fn(), deleteTimeout: vi.fn() };
      const service = new FormulaRecomputeService({} as never, graph, scheduler as never);

      service.recomputeDatabaseAsync('db-1');

      expect(scheduler.addTimeout).toHaveBeenCalledTimes(1);
      const [name] = scheduler.addTimeout.mock.calls[0];
      expect(name).toContain('db-1');
    } finally {
      vi.useRealTimers();
    }
  });
});
