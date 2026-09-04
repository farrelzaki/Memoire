import { describe, expect, it } from 'vitest';
import { fractionalPosition, needsRenormalization, renormalizePositions } from './position';

// Full coverage lives in packages/validation/src/position.spec.ts — this just
// confirms the re-export surface (`@/lib/position`) still works.
describe('position re-export', () => {
  it('fractionalPosition/needsRenormalization/renormalizePositions are reachable from @/lib/position', () => {
    expect(fractionalPosition(1, 3)).toBe(2);
    expect(needsRenormalization(1, 1 + 1e-9)).toBe(true);
    expect(renormalizePositions([{ id: 'a' }])).toEqual([{ id: 'a', position: 0 }]);
  });
});
