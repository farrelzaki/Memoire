/**
 * Truncate a string to `maxLength`, appending an ellipsis when it is cut.
 * Shared formatting helper (kept dependency-free so it stays unit-testable).
 */
export function truncate(input: string, maxLength: number): string {
  if (input.length <= maxLength) return input;
  return `${input.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
