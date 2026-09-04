/**
 * RFC 4180 CSV parser for import (§30A.1, Sprint 24B) — hand-rolled, the
 * read-side mirror of `apps/web/lib/csv.ts`'s writer (same precedent as
 * `markdown-to-blocks.lib.ts`: a well-specified format doesn't need a
 * dependency). Handles quoted fields, embedded commas/quotes/newlines, and
 * `""` escaping.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const normalized = text.replace(/\r\n/g, '\n');

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < normalized.length) {
    const char = normalized[i];

    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === ',') {
      endField();
      i++;
      continue;
    }
    if (char === '\n') {
      endRow();
      i++;
      continue;
    }
    field += char;
    i++;
  }

  // Trailing field/row, unless the document ended cleanly on a newline.
  if (field !== '' || row.length > 0) {
    endRow();
  }

  return rows;
}

export type GuessedColumnType = 'number' | 'date' | 'checkbox' | 'text';

const DATE_LIKE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * Per §30A.1: only number/date/checkbox are guessed, everything else falls
 * back to text — `select` and other richer types are never proposed (a CSV
 * cell can't supply the extra config those types need).
 */
export function guessColumnType(values: string[]): GuessedColumnType {
  const nonEmpty = values.map((v) => v.trim()).filter((v) => v !== '');
  if (nonEmpty.length === 0) return 'text';

  if (nonEmpty.every((v) => /^-?\d+(\.\d+)?$/.test(v))) return 'number';
  if (nonEmpty.every((v) => DATE_LIKE.test(v) && !Number.isNaN(Date.parse(v)))) return 'date';
  if (nonEmpty.every((v) => /^(true|false)$/i.test(v))) return 'checkbox';
  return 'text';
}
