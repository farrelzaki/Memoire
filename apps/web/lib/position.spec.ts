import { describe, expect, it } from 'vitest';
import { fractionalPosition, needsRenormalization, renormalizePositions } from './position';

describe('fractionalPosition', () => {
  it('returns the midpoint between two neighbors', () => {
    expect(fractionalPosition(1, 3)).toBe(2);
  });

  it('returns 0 for an empty list', () => {
    expect(fractionalPosition(null, null)).toBe(0);
  });

  it('goes before the first item when there is no predecessor', () => {
    expect(fractionalPosition(null, 5)).toBe(4);
  });

  it('goes after the last item when there is no successor', () => {
    expect(fractionalPosition(5, null)).toBe(6);
  });

  it('returns null once the gap has collapsed', () => {
    expect(fractionalPosition(1, 1 + 1e-9)).toBeNull();
  });
});

describe('needsRenormalization', () => {
  it('is false for edge inserts and comfortable gaps', () => {
    expect(needsRenormalization(null, 5)).toBe(false);
    expect(needsRenormalization(1, 3)).toBe(false);
  });

  it('is true once a gap has collapsed', () => {
    expect(needsRenormalization(1, 1 + 1e-9)).toBe(true);
  });
});

describe('renormalizePositions', () => {
  it('assigns 0..n-1 in the given order', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(renormalizePositions(items)).toEqual([
      { id: 'a', position: 0 },
      { id: 'b', position: 1 },
      { id: 'c', position: 2 },
    ]);
  });
});
