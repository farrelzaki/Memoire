/**
 * RFC 4180 quoting for a single CSV field. Mirrors
 * `features/database/property-type-registry.ts`'s private `csvEscape` —
 * that one escapes property *values* (already routed through each
 * property type's own `toCsv`), this one is for the header row, which
 * never goes through the registry.
 */
function escapeCsvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Joins a header row and pre-escaped data rows (each cell already run
 * through a `PropertyTypeDefinition.toCsv`) into one CSV document.
 * `\r\n` line endings per RFC 4180.
 */
export function toCsvDocument(headers: string[], rows: string[][]): string {
  const lines = [headers.map(escapeCsvField).join(','), ...rows.map((row) => row.join(','))];
  return lines.join('\r\n');
}
