import { describe, expect, it } from 'vitest';
import { parseFormula } from './parser';
import { FormulaSyntaxError } from './tokenizer';

const resolve = (name: string) => ({ Price: 'p1', Qty: 'p2', Status: 'p3' })[name];

describe('parseFormula', () => {
  it('parses a number literal', () => {
    expect(parseFormula('42', resolve)).toEqual({ type: 'literal', value: 42 });
  });

  it('parses a string literal', () => {
    expect(parseFormula('"hi"', resolve)).toEqual({ type: 'literal', value: 'hi' });
  });

  it('parses true/false/null as literals', () => {
    expect(parseFormula('true', resolve)).toEqual({ type: 'literal', value: true });
    expect(parseFormula('false', resolve)).toEqual({ type: 'literal', value: false });
    expect(parseFormula('null', resolve)).toEqual({ type: 'literal', value: null });
  });

  it('resolves prop() to a property id', () => {
    expect(parseFormula('prop("Price")', resolve)).toEqual({
      type: 'prop',
      propertyId: 'p1',
      propertyName: 'Price',
    });
  });

  it('rejects prop() with an unknown name', () => {
    expect(() => parseFormula('prop("Nope")', resolve)).toThrow(FormulaSyntaxError);
  });

  it('applies arithmetic precedence: * before +', () => {
    const ast = parseFormula('1 + 2 * 3', resolve);
    expect(ast).toEqual({
      type: 'binary',
      op: '+',
      left: { type: 'literal', value: 1 },
      right: { type: 'binary', op: '*', left: { type: 'literal', value: 2 }, right: { type: 'literal', value: 3 } },
    });
  });

  it('respects parentheses over precedence', () => {
    const ast = parseFormula('(1 + 2) * 3', resolve);
    expect(ast).toMatchObject({ type: 'binary', op: '*' });
    expect((ast as { left: unknown }).left).toEqual({
      type: 'binary',
      op: '+',
      left: { type: 'literal', value: 1 },
      right: { type: 'literal', value: 2 },
    });
  });

  it('is left-associative for chained subtraction', () => {
    // (1 - 2) - 3, not 1 - (2 - 3)
    const ast = parseFormula('1 - 2 - 3', resolve) as { left: unknown; right: unknown };
    expect(ast.right).toEqual({ type: 'literal', value: 3 });
    expect(ast.left).toEqual({
      type: 'binary',
      op: '-',
      left: { type: 'literal', value: 1 },
      right: { type: 'literal', value: 2 },
    });
  });

  it('binds "not" tighter than "and"/"or"', () => {
    // "not a and b" == "(not a) and b"
    const ast = parseFormula('not prop("Status") and true', resolve);
    expect(ast).toMatchObject({
      type: 'binary',
      op: 'and',
      left: { type: 'unary', op: 'not', operand: { type: 'prop', propertyId: 'p3' } },
      right: { type: 'literal', value: true },
    });
  });

  it('parses a ternary conditional, right-associative', () => {
    const ast = parseFormula('true ? 1 : false ? 2 : 3', resolve);
    expect(ast).toMatchObject({
      type: 'conditional',
      test: { type: 'literal', value: true },
      consequent: { type: 'literal', value: 1 },
      alternate: { type: 'conditional', test: { type: 'literal', value: false } },
    });
  });

  it('parses a function call with multiple arguments', () => {
    const ast = parseFormula('concat("a", "b", "c")', resolve);
    expect(ast).toEqual({
      type: 'call',
      name: 'concat',
      args: [
        { type: 'literal', value: 'a' },
        { type: 'literal', value: 'b' },
        { type: 'literal', value: 'c' },
      ],
    });
  });

  it('parses a realistic formula: prop("Price") * prop("Qty")', () => {
    const ast = parseFormula('prop("Price") * prop("Qty")', resolve);
    expect(ast).toEqual({
      type: 'binary',
      op: '*',
      left: { type: 'prop', propertyId: 'p1', propertyName: 'Price' },
      right: { type: 'prop', propertyId: 'p2', propertyName: 'Qty' },
    });
  });

  it('throws with a position on a trailing token', () => {
    try {
      parseFormula('1 + 2 3', resolve);
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(FormulaSyntaxError);
    }
  });

  it('throws on an unclosed paren', () => {
    expect(() => parseFormula('(1 + 2', resolve)).toThrow(FormulaSyntaxError);
  });

  it('suggests prop() for a bare identifier', () => {
    expect(() => parseFormula('Price', resolve)).toThrow(/prop\("Price"\)/);
  });
});
