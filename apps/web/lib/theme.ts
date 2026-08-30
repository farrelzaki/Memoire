export type Theme = 'light' | 'dark' | 'system';

/** Resolve a theme preference to a concrete mode (§34). */
export function resolveTheme(theme: Theme, systemDark: boolean): 'light' | 'dark' {
  if (theme === 'system') return systemDark ? 'dark' : 'light';
  return theme;
}

export function nextTheme(theme: Theme): Theme {
  return theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
}
