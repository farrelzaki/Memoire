import { beforeEach, describe, expect, it } from 'vitest';
import {
  clampSidebarWidth,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  useSidebarStore,
} from './sidebar';

describe('clampSidebarWidth', () => {
  it('keeps a width that is already in range', () => {
    expect(clampSidebarWidth(300)).toBe(300);
  });

  it('clamps a drag below the minimum', () => {
    expect(clampSidebarWidth(20)).toBe(SIDEBAR_MIN_WIDTH);
  });

  it('clamps a drag past the maximum', () => {
    expect(clampSidebarWidth(9999)).toBe(SIDEBAR_MAX_WIDTH);
  });

  it('rounds sub-pixel drag positions', () => {
    expect(clampSidebarWidth(260.4)).toBe(260);
  });
});

describe('useSidebarStore selection', () => {
  beforeEach(() => {
    useSidebarStore.setState({ selectedIds: [], lastSelectedId: null });
  });

  const ids = ['a', 'b', 'c', 'd', 'e'];

  it('selectOne replaces the selection with a single row', () => {
    useSidebarStore.getState().selectOne('a');
    useSidebarStore.getState().selectOne('b');
    expect(useSidebarStore.getState().selectedIds).toEqual(['b']);
    expect(useSidebarStore.getState().lastSelectedId).toBe('b');
  });

  it('toggleSelect adds and removes a row from the selection', () => {
    const { toggleSelect } = useSidebarStore.getState();
    toggleSelect('a');
    toggleSelect('b');
    expect(useSidebarStore.getState().selectedIds).toEqual(['a', 'b']);
    toggleSelect('a');
    expect(useSidebarStore.getState().selectedIds).toEqual(['b']);
  });

  it('selectRange selects everything between the anchor and the target', () => {
    useSidebarStore.getState().selectOne('b');
    useSidebarStore.getState().selectRange(ids, 'd');
    expect(useSidebarStore.getState().selectedIds).toEqual(['b', 'c', 'd']);
  });

  it('selectRange works in reverse when the target is before the anchor', () => {
    useSidebarStore.getState().selectOne('d');
    useSidebarStore.getState().selectRange(ids, 'b');
    expect(useSidebarStore.getState().selectedIds).toEqual(['b', 'c', 'd']);
  });

  it('selectRange falls back to a single selection with no prior anchor', () => {
    useSidebarStore.getState().selectRange(ids, 'c');
    expect(useSidebarStore.getState().selectedIds).toEqual(['c']);
  });

  it('clearSelection empties the selection and resets the anchor', () => {
    useSidebarStore.getState().selectOne('a');
    useSidebarStore.getState().clearSelection();
    expect(useSidebarStore.getState().selectedIds).toEqual([]);
    expect(useSidebarStore.getState().lastSelectedId).toBeNull();
  });
});
