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
