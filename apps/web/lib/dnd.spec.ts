import { describe, expect, it } from 'vitest';
import { neighborsAfterDrag } from './dnd';

describe('neighborsAfterDrag', () => {
  const order = ['a', 'b', 'c', 'd'];

  it('lands right after `over` when dragging down (dnd-kit arrayMove semantics)', () => {
    // a b c d -> drag "a" down onto "c": a takes c's slot, landing between c and d
    expect(neighborsAfterDrag(order, 'a', 'c')).toEqual({ beforeId: 'c', afterId: 'd' });
  });

  it('drops between `over` and the item after it when dragging up', () => {
    // a b c d -> drag "d" up onto "b": lands between a and b
    expect(neighborsAfterDrag(order, 'd', 'b')).toEqual({ beforeId: 'a', afterId: 'b' });
  });

  it('drops at the very start when dragging onto the first item, moving up', () => {
    expect(neighborsAfterDrag(order, 'd', 'a')).toEqual({ beforeId: null, afterId: 'a' });
  });

  it('drops at the very end when dragging onto the last item', () => {
    expect(neighborsAfterDrag(order, 'a', 'd')).toEqual({ beforeId: 'd', afterId: null });
  });

  it('drops adjacent to a neighbor already next to it (no-op-ish single-step move)', () => {
    expect(neighborsAfterDrag(order, 'b', 'a')).toEqual({ beforeId: null, afterId: 'a' });
  });

  it('returns null anchors for an unknown active/over id', () => {
    expect(neighborsAfterDrag(order, 'ghost', 'a')).toEqual({ beforeId: null, afterId: null });
    expect(neighborsAfterDrag(order, 'a', 'ghost')).toEqual({ beforeId: null, afterId: null });
  });
});
