import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseProperties, databaseRelationLinks, databaseRows, databases, databaseViews } from '../db/schema';
import type { DrizzleDB } from '../db/drizzle.provider';
import { DatabasesService } from './databases.service';
import { FormulaGraphService } from './formula-graph.service';
import { FormulaRecomputeService } from './formula-recompute.service';

/**
 * A fake DB keyed by table reference, with a per-table FIFO queue of select
 * results — good enough to drive `DatabasesService`'s formula/rollup
 * branches, which call `select().from(table).where()` several times in a
 * fixed, known order per method. `insert`/`update` return whatever was
 * written (merged with a generated id), which is all these tests check.
 */
function fakeDb(selectQueues: Map<unknown, unknown[][]>): DrizzleDB {
  const nextSelect = (table: unknown): unknown[] => {
    const queue = selectQueues.get(table);
    if (!queue || queue.length === 0) throw new Error('fakeDb: unscripted select for table');
    return queue.shift()!;
  };

  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: async () => nextSelect(table),
      }),
    }),
    selectDistinct: () => ({
      from: (table: unknown) => ({
        where: async () => nextSelect(table),
      }),
    }),
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        returning: async () => [{ id: 'generated-id', ...v }],
        onConflictDoNothing: async () => undefined,
      }),
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => [{ id: 'updated-id', ...v }],
        }),
      }),
    }),
    delete: () => ({
      where: async () => undefined,
    }),
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(db),
  };
  return db as unknown as DrizzleDB;
}

const DB_ID = 'db-1';

function propertyRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return { id: 'p', name: 'P', databaseId: DB_ID, type: 'text', config: null, position: 0, ...overrides };
}

function makeService(selectQueues: Map<unknown, unknown[][]>): DatabasesService {
  const db = fakeDb(selectQueues);
  const graph = new FormulaGraphService(db);
  const recompute = new FormulaRecomputeService(db, graph, { addTimeout: vi.fn(), deleteTimeout: vi.fn() } as never);
  return new DatabasesService(db, {} as never, graph, recompute);
}

// Property creation for formula/rollup schedules a fire-and-forget recompute
// (`recomputeDatabaseAsync`) via a real 0ms timeout — fake the clock so it
// never actually fires against these tests' exhausted fakeDb queues.
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('DatabasesService.createProperty — formula', () => {
  it('rejects a formula that references an unknown property name', async () => {
    const queues = new Map<unknown, unknown[][]>([
      [databases, [[{ id: DB_ID }]]],
      [databaseProperties, [[]]], // name resolution: no existing properties
    ]);
    const service = makeService(queues);

    await expect(
      service.createProperty(DB_ID, { name: 'Total', type: 'formula', config: { source: 'prop("Nope")' } }),
    ).rejects.toThrow(/No property named "Nope"/);
  });

  it('rejects a self-referencing formula as a cycle', async () => {
    const queues = new Map<unknown, unknown[][]>([
      [databases, [[{ id: DB_ID }]]],
      [databaseProperties, [[], []]], // name resolution, then FormulaGraphService.getGraph
    ]);
    const service = makeService(queues);

    await expect(
      service.createProperty(DB_ID, { id: 'self', name: 'Self', type: 'formula', config: { source: 'prop("Self") + 1' } }),
    ).rejects.toThrow(/Circular formula reference/);
  });

  it('accepts a valid formula and materializes ast/volatile', async () => {
    const priceProp = propertyRow({ id: 'price', name: 'Price', type: 'number' });
    const queues = new Map<unknown, unknown[][]>([
      [databases, [[{ id: DB_ID }]]],
      [databaseProperties, [[priceProp], [priceProp], [{ max: 0 }]]],
    ]);
    const service = makeService(queues);

    const created = await service.createProperty(DB_ID, {
      name: 'Total',
      type: 'formula',
      config: { source: 'prop("Price") * 2' },
    });

    expect(created.config).toMatchObject({ source: 'prop("Price") * 2', volatile: false });
    expect((created.config as { ast: { type: string } }).ast.type).toBe('binary');
  });

  it('marks now()/today() formulas volatile', async () => {
    const queues = new Map<unknown, unknown[][]>([
      [databases, [[{ id: DB_ID }]]],
      [databaseProperties, [[], [], [{ max: 0 }]]],
    ]);
    const service = makeService(queues);

    const created = await service.createProperty(DB_ID, { name: 'Today', type: 'formula', config: { source: 'today()' } });

    expect(created.config).toMatchObject({ volatile: true });
  });
});

describe('DatabasesService.createProperty — rollup', () => {
  it('rejects when relationPropertyId is not a relation property on this database', async () => {
    const notRelation = propertyRow({ id: 'rel', name: 'Rel', type: 'text' });
    const queues = new Map<unknown, unknown[][]>([
      [databases, [[{ id: DB_ID }]]],
      [databaseProperties, [[notRelation]]],
    ]);
    const service = makeService(queues);

    await expect(
      service.createProperty(DB_ID, {
        name: 'Sum',
        type: 'rollup',
        config: { relationPropertyId: 'rel', targetPropertyId: 'target' },
      }),
    ).rejects.toThrow(/relationPropertyId must reference a relation property/);
  });

  it('rejects when the target property is itself a rollup (1-hop limit)', async () => {
    const relationProp = propertyRow({
      id: 'rel',
      name: 'Rel',
      type: 'relation',
      config: { targetDatabaseId: 'db-2', allowMultiple: true, inversePropertyId: null },
    });
    const targetRollup = propertyRow({ id: 'target', name: 'Target', databaseId: 'db-2', type: 'rollup' });
    const queues = new Map<unknown, unknown[][]>([
      [databases, [[{ id: DB_ID }]]],
      [databaseProperties, [[relationProp], [targetRollup]]],
    ]);
    const service = makeService(queues);

    await expect(
      service.createProperty(DB_ID, {
        name: 'Sum',
        type: 'rollup',
        config: { relationPropertyId: 'rel', targetPropertyId: 'target' },
      }),
    ).rejects.toThrow(/1-hop limit/);
  });

  it('accepts a rollup pointed at a valid relation + target property', async () => {
    const relationProp = propertyRow({
      id: 'rel',
      name: 'Rel',
      type: 'relation',
      config: { targetDatabaseId: 'db-2', allowMultiple: true, inversePropertyId: null },
    });
    const targetProp = propertyRow({ id: 'target', name: 'Hours', databaseId: 'db-2', type: 'number' });
    const queues = new Map<unknown, unknown[][]>([
      [databases, [[{ id: DB_ID }]]],
      [databaseProperties, [[relationProp], [targetProp], [{ max: 1 }]]],
    ]);
    const service = makeService(queues);

    const created = await service.createProperty(DB_ID, {
      name: 'Total hours',
      type: 'rollup',
      config: { relationPropertyId: 'rel', targetPropertyId: 'target', function: 'sum' },
    });

    expect(created.type).toBe('rollup');
  });
});

describe('DatabasesService.deleteProperty', () => {
  it('rejects (409) when a formula still references this property', async () => {
    const target = propertyRow({ id: 'price', name: 'Price', type: 'number' });
    const dependentFormula = propertyRow({
      id: 'total',
      name: 'Total',
      type: 'formula',
      config: { source: 'prop("Price")', ast: { type: 'prop', propertyId: 'price', propertyName: 'Price' }, volatile: false, returnType: 'unknown' },
    });
    const queues = new Map<unknown, unknown[][]>([
      [databaseProperties, [[target], [target, dependentFormula], [target, dependentFormula]]],
    ]);
    const service = makeService(queues);

    await expect(service.deleteProperty('price')).rejects.toThrow(/still referenced by formula\(s\) Total/);
  });

  it('deletes a property with no dependents and sweeps views', async () => {
    const target = propertyRow({ id: 'price', name: 'Price', type: 'number' });
    const queues = new Map<unknown, unknown[][]>([
      [databaseProperties, [[target], [target], []]], // ensureProperty, dependentsOf's getGraph, remainingProperties
      [databaseViews, [[]]], // no views to sweep
    ]);
    const service = makeService(queues);

    const result = await service.deleteProperty('price');

    expect(result).toEqual({ id: 'price', deleted: true });
  });

  it('deletes database_relation_links rows when deleting a relation property', async () => {
    const relationProp = propertyRow({
      id: 'rel',
      name: 'Rel',
      type: 'relation',
      config: { targetDatabaseId: 'db-2', allowMultiple: true, inversePropertyId: null },
    });
    const queues = new Map<unknown, unknown[][]>([
      [databaseProperties, [[relationProp], [relationProp], []]],
      [databaseViews, [[]]],
    ]);
    const db = fakeDb(queues);
    const deleteSpy = vi.spyOn(db, 'delete');
    const graph = new FormulaGraphService(db);
    const recompute = new FormulaRecomputeService(db, graph, { addTimeout: vi.fn(), deleteTimeout: vi.fn() } as never);
    const service = new DatabasesService(db, {} as never, graph, recompute);

    await service.deleteProperty('rel');

    expect(deleteSpy.mock.calls.some(([table]) => table === databaseRelationLinks)).toBe(true);
  });
});

describe('DatabasesService.addRelation / removeRelation', () => {
  it('rejects when the property is not a relation', async () => {
    const notRelation = propertyRow({ id: 'p', name: 'P', type: 'text' });
    const queues = new Map<unknown, unknown[][]>([[databaseProperties, [[notRelation]]]]);
    const service = makeService(queues);

    await expect(service.addRelation('row-1', 'p', 'row-2')).rejects.toThrow(/not a relation/);
  });

  it('inserts a one-way link and recomputes the source row', async () => {
    const relationProp = propertyRow({
      id: 'rel',
      name: 'Rel',
      databaseId: 'db-1',
      type: 'relation',
      config: { targetDatabaseId: 'db-2', allowMultiple: true, inversePropertyId: null },
    });
    const rowRow = { id: 'row-1', databaseId: 'db-1', values: {}, computed: {} };
    const queues = new Map<unknown, unknown[][]>([
      [databaseProperties, [[relationProp], [relationProp], [relationProp]]], // ensureProperty, recomputeRowById's own select, graph.getGraph
      [databaseRows, [[rowRow]]],
    ]);
    const db = fakeDb(queues);
    const insertSpy = vi.spyOn(db, 'insert');
    const graph = new FormulaGraphService(db);
    const recompute = new FormulaRecomputeService(db, graph, { addTimeout: vi.fn(), deleteTimeout: vi.fn() } as never);
    const service = new DatabasesService(db, {} as never, graph, recompute);

    await service.addRelation('row-1', 'rel', 'row-2');

    expect(insertSpy.mock.calls.some(([table]) => table === databaseRelationLinks)).toBe(true);
  });

  it('removes a one-way link and recomputes the source row', async () => {
    const relationProp = propertyRow({
      id: 'rel',
      name: 'Rel',
      databaseId: 'db-1',
      type: 'relation',
      config: { targetDatabaseId: 'db-2', allowMultiple: true, inversePropertyId: null },
    });
    const rowRow = { id: 'row-1', databaseId: 'db-1', values: {}, computed: {} };
    const queues = new Map<unknown, unknown[][]>([
      [databaseProperties, [[relationProp], [relationProp], [relationProp]]],
      [databaseRows, [[rowRow]]],
    ]);
    const db = fakeDb(queues);
    const deleteSpy = vi.spyOn(db, 'delete');
    const graph = new FormulaGraphService(db);
    const recompute = new FormulaRecomputeService(db, graph, { addTimeout: vi.fn(), deleteTimeout: vi.fn() } as never);
    const service = new DatabasesService(db, {} as never, graph, recompute);

    await service.removeRelation('row-1', 'rel', 'row-2');

    expect(deleteSpy.mock.calls.some(([table]) => table === databaseRelationLinks)).toBe(true);
  });
});

describe('DatabasesService.updateRow — cross-database rollup invalidation', () => {
  // Regression test for a bug caught by live smoke-testing (§24A.5 case 3,
  // §24B.4): editing a Task's Hours must recompute the Project's rollup that
  // follows a relation pointing AT the Task, not just the Task's own
  // formula/rollup properties. `updateRow` has to look up which relation
  // properties reference this row (`database_relation_links.to_row_id`) and
  // call `recomputeDependents` for each — a hand-built fake since the exact
  // multi-table call sequence matters here, not just "some select happened".
  it("recomputes a rollup on another database that follows a relation pointing at this row", async () => {
    const taskRow = { id: 'task-1', databaseId: 'tasks-db', pageId: null, values: { hours: 5 }, computed: {} };
    const projectRow = { id: 'proj-1', databaseId: 'projects-db', pageId: null, values: {}, computed: {} };
    const hoursProperty = propertyRow({ id: 'hours', name: 'Hours', databaseId: 'tasks-db', type: 'number' });
    const rollupProp = propertyRow({
      id: 'total',
      name: 'Total',
      databaseId: 'projects-db',
      type: 'rollup',
      config: { relationPropertyId: 'rel', targetPropertyId: 'hours', function: 'sum' },
    });

    let databaseRowsSelectCalls = 0;
    let relationLinksCalls = 0;
    let databasePropertiesSelectCalls = 0;
    let databaseRowsUpdateCalls = 0;

    const db = {
      select: () => ({
        from: (table: unknown) => ({
          where: async () => {
            if (table === databaseRows) {
              databaseRowsSelectCalls += 1;
              return databaseRowsSelectCalls === 1 ? [taskRow] : [projectRow];
            }
            if (table === databaseRelationLinks) {
              relationLinksCalls += 1;
              return [{ fromRowId: 'proj-1' }]; // recomputeDependents' link lookup
            }
            if (table === databaseProperties) {
              databasePropertiesSelectCalls += 1;
              // 1-2: tasks-db properties (updateRow's own fetch + its graph); 3-4: projects-db properties (recomputeDependents' fetch + its graph)
              return databasePropertiesSelectCalls <= 2 ? [hoursProperty] : [rollupProp];
            }
            return [];
          },
        }),
      }),
      selectDistinct: () => ({
        from: (table: unknown) => ({
          where: async () => {
            if (table === databaseRelationLinks) {
              relationLinksCalls += 1;
              return [{ propertyId: 'rel' }]; // one relation property references task-1
            }
            return [];
          },
        }),
      }),
      update: (table: unknown) => ({
        set: (v: Record<string, unknown>) => ({
          where: () => ({
            returning: async () => {
              if (table === databaseRows) {
                databaseRowsUpdateCalls += 1;
                // 1st: updateRow's own value write; 2nd: task-1's computed write; 3rd: proj-1's computed write
                if (databaseRowsUpdateCalls === 1) return [{ ...taskRow, ...v }];
                if (databaseRowsUpdateCalls === 2) return [{ ...taskRow, ...v }];
                return [{ ...projectRow, ...v }];
              }
              return [{ ...v }];
            },
          }),
        }),
      }),
      transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(db),
    } as unknown as DrizzleDB;

    const graph = new FormulaGraphService(db);
    const recompute = new FormulaRecomputeService(db, graph, { addTimeout: vi.fn(), deleteTimeout: vi.fn() } as never);
    const service = new DatabasesService(db, {} as never, graph, recompute);

    await service.updateRow('task-1', { hours: 20 });

    // 1: selectDistinct finds "rel" references task-1; 2: recomputeDependents finds proj-1;
    // 3: proj-1's own rollup recompute re-reads its links to sum Hours.
    expect(relationLinksCalls).toBe(3);
    // The dependent row (proj-1) got its rollup recomputed — proven by its computed-write happening.
    expect(databaseRowsUpdateCalls).toBe(3);
  });
});

describe('DatabasesService.updateProperty — relation two-way toggle', () => {
  it('creates a paired inverse property on the target database when toggled two-way', async () => {
    const relationProp = propertyRow({
      id: 'rel',
      name: 'Tasks',
      databaseId: 'db-1',
      type: 'relation',
      config: { targetDatabaseId: 'db-2', allowMultiple: true, inversePropertyId: null },
    });
    const queues = new Map<unknown, unknown[][]>([
      [databaseProperties, [[relationProp], [{ max: -1 }]]], // ensureProperty, nextPropertyPosition(targetDatabaseId)
    ]);
    const db = fakeDb(queues);
    const insertSpy = vi.spyOn(db, 'insert');
    const graph = new FormulaGraphService(db);
    const recompute = new FormulaRecomputeService(db, graph, { addTimeout: vi.fn(), deleteTimeout: vi.fn() } as never);
    const service = new DatabasesService(db, {} as never, graph, recompute);

    const result = await service.updateProperty('rel', {
      config: { targetDatabaseId: 'db-2', allowMultiple: true, twoWay: true },
    });

    expect(insertSpy.mock.calls.some(([table]) => table === databaseProperties)).toBe(true);
    expect((result.config as { inversePropertyId: string | null }).inversePropertyId).toBeTruthy();
  });

  it('removes the paired inverse property when toggled back one-way', async () => {
    const relationProp = propertyRow({
      id: 'rel',
      name: 'Tasks',
      databaseId: 'db-1',
      type: 'relation',
      config: { targetDatabaseId: 'db-2', allowMultiple: true, inversePropertyId: 'inverse-rel' },
    });
    const queues = new Map<unknown, unknown[][]>([[databaseProperties, [[relationProp]]]]); // ensureProperty only
    const db = fakeDb(queues);
    const deleteSpy = vi.spyOn(db, 'delete');
    const graph = new FormulaGraphService(db);
    const recompute = new FormulaRecomputeService(db, graph, { addTimeout: vi.fn(), deleteTimeout: vi.fn() } as never);
    const service = new DatabasesService(db, {} as never, graph, recompute);

    const result = await service.updateProperty('rel', {
      config: { targetDatabaseId: 'db-2', allowMultiple: true, twoWay: false },
    });

    expect(deleteSpy.mock.calls.some(([table]) => table === databaseProperties)).toBe(true);
    expect((result.config as { inversePropertyId: string | null }).inversePropertyId).toBeNull();
  });
});

/** Wraps a fakeDb's `update` to record every `{table, values}` a `.set(...)` call makes, while still delegating to the real chain. */
function captureUpdates(db: DrizzleDB): Array<{ table: unknown; values: Record<string, unknown> }> {
  const calls: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const original = (db as unknown as { update: (table: unknown) => { set: (v: Record<string, unknown>) => unknown } }).update;
  (db as unknown as { update: unknown }).update = (table: unknown) => {
    const chain = original(table);
    return {
      set: (v: Record<string, unknown>) => {
        calls.push({ table, values: v });
        return chain.set(v);
      },
    };
  };
  return calls;
}

describe('DatabasesService.reorderRow', () => {
  it('computes the midpoint between two neighbors', async () => {
    const row1 = { id: 'row-1', databaseId: 'db-1', values: {}, computed: {}, position: 0 };
    const row2 = { id: 'row-2', databaseId: 'db-1', values: {}, computed: {}, position: 1 };
    const row3 = { id: 'row-3', databaseId: 'db-1', values: {}, computed: {}, position: 4 };
    const queues = new Map<unknown, unknown[][]>([[databaseRows, [[row2], [row1, row2, row3]]]]);
    const db = fakeDb(queues);
    const updates = captureUpdates(db);
    const graph = new FormulaGraphService(db);
    const recompute = new FormulaRecomputeService(db, graph, { addTimeout: vi.fn(), deleteTimeout: vi.fn() } as never);
    const service = new DatabasesService(db, {} as never, graph, recompute);

    await service.reorderRow('row-2', 'row-1', 'row-3');

    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({ table: databaseRows, values: { position: 2 } });
  });

  it('goes before the first item when beforeId is null, and after the last when afterId is null', async () => {
    const row1 = { id: 'row-1', databaseId: 'db-1', values: {}, computed: {}, position: 5 };
    const row2 = { id: 'row-2', databaseId: 'db-1', values: {}, computed: {}, position: 1 };
    const queuesStart = new Map<unknown, unknown[][]>([[databaseRows, [[row2], [row1, row2]]]]);
    const dbStart = fakeDb(queuesStart);
    const updatesStart = captureUpdates(dbStart);
    const graphStart = new FormulaGraphService(dbStart);
    const recomputeStart = new FormulaRecomputeService(dbStart, graphStart, { addTimeout: vi.fn(), deleteTimeout: vi.fn() } as never);
    await new DatabasesService(dbStart, {} as never, graphStart, recomputeStart).reorderRow('row-2', null, 'row-1');
    expect(updatesStart[0].values).toEqual({ position: 4 });

    const queuesEnd = new Map<unknown, unknown[][]>([[databaseRows, [[row2], [row1, row2]]]]);
    const dbEnd = fakeDb(queuesEnd);
    const updatesEnd = captureUpdates(dbEnd);
    const graphEnd = new FormulaGraphService(dbEnd);
    const recomputeEnd = new FormulaRecomputeService(dbEnd, graphEnd, { addTimeout: vi.fn(), deleteTimeout: vi.fn() } as never);
    await new DatabasesService(dbEnd, {} as never, graphEnd, recomputeEnd).reorderRow('row-2', 'row-1', null);
    expect(updatesEnd[0].values).toEqual({ position: 6 });
  });

  it('renormalizes every sibling once the gap between anchors has collapsed, then retries', async () => {
    const row1 = { id: 'row-1', databaseId: 'db-1', values: {}, computed: {}, position: 1 };
    const row2 = { id: 'row-2', databaseId: 'db-1', values: {}, computed: {}, position: 0.5 };
    const row3 = { id: 'row-3', databaseId: 'db-1', values: {}, computed: {}, position: 1 + 1e-9 };
    const queues = new Map<unknown, unknown[][]>([[databaseRows, [[row2], [row1, row2, row3]]]]);
    const db = fakeDb(queues);
    const updates = captureUpdates(db);
    const graph = new FormulaGraphService(db);
    const recompute = new FormulaRecomputeService(db, graph, { addTimeout: vi.fn(), deleteTimeout: vi.fn() } as never);
    const service = new DatabasesService(db, {} as never, graph, recompute);

    await service.reorderRow('row-2', 'row-1', 'row-3');

    // 3 renumbering writes (row2->0, row1->1, row3->2) + 1 final write at the retried midpoint.
    expect(updates).toHaveLength(4);
    expect(updates[updates.length - 1].values).toEqual({ position: 1.5 });
  });

  it('rejects an unknown reorder anchor', async () => {
    const row2 = { id: 'row-2', databaseId: 'db-1', values: {}, computed: {}, position: 1 };
    const queues = new Map<unknown, unknown[][]>([[databaseRows, [[row2], [row2]]]]);
    const service = makeService(queues);

    await expect(service.reorderRow('row-2', 'ghost', null)).rejects.toThrow(/Reorder anchor ghost not found/);
  });
});

describe('DatabasesService.reorderProperty / reorderView', () => {
  it('reorderProperty computes the midpoint between two neighbor columns', async () => {
    const p1 = propertyRow({ id: 'p-1', position: 0 });
    const p2 = propertyRow({ id: 'p-2', position: 1 });
    const p3 = propertyRow({ id: 'p-3', position: 4 });
    const queues = new Map<unknown, unknown[][]>([[databaseProperties, [[p2], [p1, p2, p3]]]]);
    const db = fakeDb(queues);
    const updates = captureUpdates(db);
    const graph = new FormulaGraphService(db);
    const recompute = new FormulaRecomputeService(db, graph, { addTimeout: vi.fn(), deleteTimeout: vi.fn() } as never);
    const service = new DatabasesService(db, {} as never, graph, recompute);

    await service.reorderProperty('p-2', 'p-1', 'p-3');

    expect(updates).toEqual([{ table: databaseProperties, values: { position: 2 } }]);
  });

  it('reorderView computes the midpoint between two neighbor tabs', async () => {
    const v1 = { id: 'v-1', databaseId: 'db-1', name: 'A', type: 'table', config: null, position: 0 };
    const v2 = { id: 'v-2', databaseId: 'db-1', name: 'B', type: 'table', config: null, position: 1 };
    const v3 = { id: 'v-3', databaseId: 'db-1', name: 'C', type: 'table', config: null, position: 4 };
    const queues = new Map<unknown, unknown[][]>([[databaseViews, [[v2], [v1, v2, v3]]]]);
    const db = fakeDb(queues);
    const updates = captureUpdates(db);
    const graph = new FormulaGraphService(db);
    const recompute = new FormulaRecomputeService(db, graph, { addTimeout: vi.fn(), deleteTimeout: vi.fn() } as never);
    const service = new DatabasesService(db, {} as never, graph, recompute);

    await service.reorderView('v-2', 'v-1', 'v-3');

    expect(updates).toEqual([{ table: databaseViews, values: { position: 2 } }]);
  });
});

describe('DatabasesService.reorderRowIntoGroup', () => {
  it('writes the new group value and the new position in one update', async () => {
    const row1 = { id: 'row-1', databaseId: 'db-1', values: {}, computed: {}, position: 0 };
    const row2 = { id: 'row-2', databaseId: 'db-1', values: { status: 'todo' }, computed: {}, position: 1 };
    const row3 = { id: 'row-3', databaseId: 'db-1', values: {}, computed: {}, position: 4 };
    const queues = new Map<unknown, unknown[][]>([
      [databaseRows, [[row2], [row1, row2, row3]]],
      [databaseProperties, [[], []]], // recomputeRowAndDependents' own fetch + its graph.getGraph
      [databaseRelationLinks, [[]]], // selectDistinct — nothing references this row
    ]);
    const db = fakeDb(queues);
    const updates = captureUpdates(db);
    const graph = new FormulaGraphService(db);
    const recompute = new FormulaRecomputeService(db, graph, { addTimeout: vi.fn(), deleteTimeout: vi.fn() } as never);
    const service = new DatabasesService(db, {} as never, graph, recompute);

    await service.reorderRowIntoGroup('row-2', 'status', 'done', 'row-1', 'row-3');

    const groupUpdate = updates.find((u) => u.table === databaseRows && 'values' in u.values);
    expect(groupUpdate?.values).toMatchObject({ values: { status: 'done' }, position: 2 });
  });
});
