import { describe, expect, it } from 'vitest';
import { nextTheme, resolveTheme } from './theme';

describe('resolveTheme', () => {
  it('resolves system to dark when the OS prefers dark', () => {
    expect(resolveTheme('system', true)).toBe('dark');
  });

  it('resolves system to light when the OS prefers light', () => {
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('honours an explicit theme regardless of system', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });
});

describe('nextTheme', () => {
  it('cycles light -> dark -> system -> light', () => {
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('system');
    expect(nextTheme('system')).toBe('light');
  });
});
