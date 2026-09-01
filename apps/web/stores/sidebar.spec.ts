import { describe, expect, it } from 'vitest';
import {
  clampSidebarWidth,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
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
