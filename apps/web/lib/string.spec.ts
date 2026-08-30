import { describe, expect, it } from 'vitest';
import { truncate } from './string';

describe('truncate', () => {
  it('returns the input unchanged when it fits', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates and appends an ellipsis when it does not fit', () => {
    expect(truncate('hello world', 5)).toBe('hell…');
  });
});
