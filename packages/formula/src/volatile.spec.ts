import { describe, expect, it } from 'vitest';
import { isVolatile, referencedPropertyIds } from './volatile';
import { parseFormula } from './parser';

const resolve = (name: string) => ({ Price: 'p1', Qty: 'p2', Due: 'p3' })[name];

describe('isVolatile', () => {
  it('is false for a formula with no now()/today()', () => {
    expect(isVolatile(parseFormula('prop("Price") * prop("Qty")', resolve))).toBe(false);
  });

  it('is true for a direct now() call', () => {
    expect(isVolatile(parseFormula('now()', resolve))).toBe(true);
  });

  it('is true for today() nested inside another function call', () => {
    expect(isVolatile(parseFormula('dateBetween(prop("Due"), today())', resolve))).toBe(true);
  });

  it('is true when now()/today() is inside a conditional branch', () => {
    expect(isVolatile(parseFormula('true ? now() : 1', resolve))).toBe(true);
    expect(isVolatile(parseFormula('true ? 1 : today()', resolve))).toBe(true);
  });

  it('is true when now()/today() is inside a binary expression', () => {
    expect(isVolatile(parseFormula('1 + dateBetween(now(), prop("Due"))', resolve))).toBe(true);
  });
});

describe('referencedPropertyIds', () => {
  it('collects every prop() id, deduplicated', () => {
    const ast = parseFormula('prop("Price") * prop("Qty") + prop("Price")', resolve);
    expect(referencedPropertyIds(ast).sort()).toEqual(['p1', 'p2']);
  });

  it('returns an empty array for a formula with no prop()', () => {
    expect(referencedPropertyIds(parseFormula('1 + 2', resolve))).toEqual([]);
  });

  it('finds prop() nested inside function calls and conditionals', () => {
    const ast = parseFormula('if(prop("Price") > 0, prop("Qty"), 0)', resolve);
    expect(referencedPropertyIds(ast).sort()).toEqual(['p1', 'p2']);
  });
});
