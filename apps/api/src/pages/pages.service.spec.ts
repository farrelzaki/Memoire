import { describe, expect, it } from 'vitest';
import { pages } from '../db/schema';
import type { DrizzleDB } from '../db/drizzle.provider';
import { PagesService } from './pages.service';

/**
 * A fake DB keyed by table reference, with a per-table FIFO queue of select
 * results — mirrors the convention in
 * `apps/api/src/databases/databases.service.spec.ts`. `update().set().where().returning()`
 * returns whatever was set, merged with a generated id.
 */
function fakeDb(selectQueues: Map<unknown, unknown[][]>): { db: DrizzleDB; updates: Array<{ table: unknown; values: Record<string, unknown> }> } {
  const nextSelect = (table: unknown): unknown[] => {
    const queue = selectQueues.get(table);
    if (!queue || queue.length === 0) throw new Error('fakeDb: unscripted select for table');
    return queue.shift()!;
  };

  const updates: Array<{ table: unknown; values: Record<string, unknown> }> = [];

  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: async () => nextSelect(table),
      }),
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        updates.push({ table, values });
        return {
          where: () => ({
            returning: async () => [{ id: 'updated-id', ...values }],
          }),
        };
      },
    }),
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(db),
  };
  return { db: db as unknown as DrizzleDB, updates };
}

function pageRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return { id: 'p', parentPageId: null, position: 0, ...overrides };
}

function makeService(selectQueues: Map<unknown, unknown[][]>) {
  const { db, updates } = fakeDb(selectQueues);
  const service = new PagesService(db, {} as never, {} as never, {} as never);
  return { service, updates };
}

describe('PagesService.move — reorder within the same parent', () => {
  it('computes the midpoint between two root-level siblings', async () => {
    const target = pageRow({ id: 'p-2', parentPageId: null, position: 1 });
    const sib1 = pageRow({ id: 'p-1', parentPageId: null, position: 0 });
    const sib3 = pageRow({ id: 'p-3', parentPageId: null, position: 4 });
    const queues = new Map<unknown, unknown[][]>([
      [pages, [[target], [sib1, target, sib3]]], // findOne, siblings
    ]);
    const { service, updates } = makeService(queues);

    await service.move('p-2', undefined, 'p-1', 'p-3');

    const write = updates.find((u) => u.table === pages);
    expect(write?.values).toMatchObject({ position: 2, parentPageId: null });
  });

  it('appends at the end when beforeId/afterId are both omitted', async () => {
    const target = pageRow({ id: 'p-1', parentPageId: null, position: 0 });
    const queues = new Map<unknown, unknown[][]>([
      [pages, [[target], [{ max: 1 }]]], // findOne, nextPosition's aggregate select
    ]);
    const { service, updates } = makeService(queues);

    await service.move('p-1', undefined, undefined, undefined);

    const write = updates.find((u) => u.table === pages);
    expect(write?.values).toMatchObject({ position: 2 });
  });

  it('renormalizes siblings and retries once the gap between anchors has collapsed', async () => {
    const target = pageRow({ id: 'p-2', parentPageId: null, position: 0.5 });
    const sib1 = pageRow({ id: 'p-1', parentPageId: null, position: 1 });
    const sib3 = pageRow({ id: 'p-3', parentPageId: null, position: 1 + 1e-9 });
    const queues = new Map<unknown, unknown[][]>([[pages, [[target], [sib1, target, sib3]]]]);
    const { service, updates } = makeService(queues);

    await service.move('p-2', undefined, 'p-1', 'p-3');

    const pageWrites = updates.filter((u) => u.table === pages);
    // 3 renumbering writes + 1 final write at the retried midpoint.
    expect(pageWrites).toHaveLength(4);
    expect(pageWrites[pageWrites.length - 1].values).toMatchObject({ position: 1.5 });
  });

  it('rejects an unknown reorder anchor', async () => {
    const target = pageRow({ id: 'p-1', parentPageId: null, position: 0 });
    const queues = new Map<unknown, unknown[][]>([[pages, [[target], [target]]]]);
    const { service } = makeService(queues);

    await expect(service.move('p-1', undefined, 'ghost', undefined)).rejects.toThrow(/Reorder anchor ghost not found/);
  });
});

describe('PagesService.move — reparent', () => {
  it('rejects making a page its own parent', async () => {
    const target = pageRow({ id: 'p-1', parentPageId: null, position: 0 });
    const queues = new Map<unknown, unknown[][]>([[pages, [[target]]]]);
    const { service } = makeService(queues);

    await expect(service.move('p-1', 'p-1', undefined, undefined)).rejects.toThrow(/cannot be its own parent/i);
  });

  it('rejects moving a page under its own descendant', async () => {
    const target = pageRow({ id: 'root', parentPageId: null, position: 0 });
    const child = pageRow({ id: 'child', parentPageId: 'root', position: 0 });
    // findOne(id), findOne(newParentId), hasAncestor's walk-up select(s)
    const queues = new Map<unknown, unknown[][]>([[pages, [[target], [child], [{ parentPageId: 'root' }]]]]);
    const { service } = makeService(queues);

    await expect(service.move('root', 'child', undefined, undefined)).rejects.toThrow(/own descendant/i);
  });

  it('reparents and appends when the new parent has no siblings yet', async () => {
    const target = pageRow({ id: 'p-1', parentPageId: null, position: 0 });
    const newParent = pageRow({ id: 'p-2', parentPageId: null, position: 1 });
    const queues = new Map<unknown, unknown[][]>([
      [pages, [[target], [newParent], [{ parentPageId: null }], [{ max: -1 }]]], // findOne, findOne(newParent), hasAncestor walk, nextPosition
    ]);
    const { service, updates } = makeService(queues);

    await service.move('p-1', 'p-2', undefined, undefined);

    const write = updates.find((u) => u.table === pages);
    expect(write?.values).toMatchObject({ parentPageId: 'p-2', position: 0 });
  });
});
