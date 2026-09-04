import { describe, expect, it } from 'vitest';
import { FormulaSyntaxError, tokenize } from './tokenizer';

describe('tokenize', () => {
  it('tokenizes numbers, including decimals', () => {
    const tokens = tokenize('1 + 2.5');
    expect(tokens.map((t) => t.type)).toEqual(['number', 'punct', 'number', 'eof']);
    expect(tokens[0].value).toBe('1');
    expect(tokens[2].value).toBe('2.5');
  });

  it('tokenizes a double-quoted string with an escaped quote', () => {
    const tokens = tokenize('"a \\"b\\" c"');
    expect(tokens[0]).toMatchObject({ type: 'string', value: 'a "b" c' });
  });

  it('tokenizes identifiers and keywords the same way', () => {
    const tokens = tokenize('a and not b');
    expect(tokens.map((t) => t.value)).toEqual(['a', 'and', 'not', 'b', '']);
  });

  it('tokenizes the two-character operators before the one-character ones', () => {
    const tokens = tokenize('a >= b != c');
    expect(tokens.map((t) => t.value)).toEqual(['a', '>=', 'b', '!=', 'c', '']);
  });

  it('tokenizes prop() calls', () => {
    const tokens = tokenize('prop("Price") * 2');
    expect(tokens.map((t) => [t.type, t.value])).toEqual([
      ['ident', 'prop'],
      ['punct', '('],
      ['string', 'Price'],
      ['punct', ')'],
      ['punct', '*'],
      ['number', '2'],
      ['eof', ''],
    ]);
  });

  it('throws FormulaSyntaxError with a position on an unterminated string', () => {
    expect(() => tokenize('"unterminated')).toThrow(FormulaSyntaxError);
  });

  it('throws FormulaSyntaxError with a position on an unexpected character', () => {
    try {
      tokenize('1 & 2');
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(FormulaSyntaxError);
      expect((e as FormulaSyntaxError).pos).toBe(2);
    }
  });
});
