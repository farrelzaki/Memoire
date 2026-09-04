import { describe, expect, it } from 'vitest';
import type { DrizzleDB } from '../db/drizzle.provider';
import { FormulaGraphService } from './formula-graph.service';

type PropertyRow = { id: string; name: string; type: string; config: unknown };

/** Minimal fake matching the exact `db.select().from(...).where(...)` chain `getGraph` uses. */
function fakeDb(rows: PropertyRow[]): DrizzleDB {
  return {
    select: () => ({
      from: () => ({
        where: async () => rows,
      }),
    }),
  } as unknown as DrizzleDB;
}

function formulaProp(id: string, name: string, refs: string[]): PropertyRow {
  return {
    id,
    name,
    type: 'formula',
    config: { source: '', ast: buildRefAst(refs), volatile: false, returnType: 'unknown' },
  };
}

// A minimal AST whose referencedPropertyIds() output is exactly `refs` — a
// nested chain of prop() reads joined by "+", which is all referencedPropertyIds needs.
function buildRefAst(refs: string[]): unknown {
  if (refs.length === 0) return { type: 'literal', value: 0 };
  let node: unknown = { type: 'prop', propertyId: refs[0], propertyName: refs[0] };
  for (const id of refs.slice(1)) {
    node = { type: 'binary', op: '+', left: node, right: { type: 'prop', propertyId: id, propertyName: id } };
  }
  return node;
}

describe('FormulaGraphService', () => {
  it('detects no cycle in a valid DAG', async () => {
    const db = fakeDb([formulaProp('a', 'A', []), formulaProp('b', 'B', ['a'])]);
    const service = new FormulaGraphService(db);
    const cycle = await service.detectCycle('db1', 'c', ['b'], 'C');
    expect(cycle).toBeNull();
  });

  it('detects a direct self-reference', async () => {
    const db = fakeDb([]);
    const service = new FormulaGraphService(db);
    const cycle = await service.detectCycle('db1', 'a', ['a'], 'A');
    expect(cycle).toEqual(['A', 'A']);
  });

  it('detects a 2-node cycle (A -> B -> A)', async () => {
    const db = fakeDb([formulaProp('a', 'A', ['b'])]);
    const service = new FormulaGraphService(db);
    const cycle = await service.detectCycle('db1', 'b', ['a'], 'B');
    // Any rotation starting from the DFS's first-visited node is a valid
    // report of the same cycle — assert it's closed and contains both names,
    // not one specific rotation.
    expect(cycle).not.toBeNull();
    expect(cycle![0]).toBe(cycle![cycle!.length - 1]);
    expect(new Set(cycle)).toEqual(new Set(['A', 'B']));
  });

  it('detects a 3-node cycle (Status -> Priority -> Due -> Status)', async () => {
    const db = fakeDb([
      formulaProp('status', 'Status', ['priority']),
      formulaProp('priority', 'Priority', ['due']),
    ]);
    const service = new FormulaGraphService(db);
    const cycle = await service.detectCycle('db1', 'due', ['status'], 'Due');
    expect(cycle).not.toBeNull();
    expect(cycle![0]).toBe(cycle![cycle!.length - 1]);
    expect(new Set(cycle)).toEqual(new Set(['Status', 'Priority', 'Due']));
  });

  it('invalidate() forces a rebuild from the DB on next access', async () => {
    let callCount = 0;
    const db = {
      select: () => ({
        from: () => ({
          where: async () => {
            callCount += 1;
            return [];
          },
        }),
      }),
    } as unknown as DrizzleDB;
    const service = new FormulaGraphService(db);

    await service.getGraph('db1');
    await service.getGraph('db1');
    expect(callCount).toBe(1); // cached on the second call

    service.invalidate('db1');
    await service.getGraph('db1');
    expect(callCount).toBe(2);
  });

  it('topoOrder puts a formula before another formula that reads its result', async () => {
    // B = A + 1 (b depends on a's result)
    const db = fakeDb([formulaProp('a', 'A', []), formulaProp('b', 'B', ['a'])]);
    const service = new FormulaGraphService(db);
    const order = await service.topoOrder('db1');
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
  });

  it('topoOrder ignores dependencies on raw (non-formula/rollup) properties', async () => {
    const db = fakeDb([formulaProp('a', 'A', ['raw-value-prop'])]);
    const service = new FormulaGraphService(db);
    const order = await service.topoOrder('db1');
    expect(order).toEqual(['a']);
  });

  it('dependentsOf finds formulas that directly reference a property', async () => {
    const db = fakeDb([
      formulaProp('a', 'A', ['x']),
      formulaProp('b', 'B', ['x', 'y']),
      formulaProp('c', 'C', ['y']),
    ]);
    const service = new FormulaGraphService(db);
    const dependents = await service.dependentsOf('db1', 'x');
    expect(dependents.sort()).toEqual(['a', 'b']);
  });
});
