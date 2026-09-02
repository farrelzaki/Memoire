import { describe, expect, it } from 'vitest';
import type { PropertyType } from '@/lib/types';
import { PropertyTypeRegistry, rowToPlainText } from './property-type-registry';

const REGISTERED_KEYS: PropertyType[] = [
  'title',
  'text',
  'number',
  'select',
  'checkbox',
  'date',
  'url',
];

describe('PropertyTypeRegistry', () => {
  it('registers every property type the schema currently allows (§20A)', () => {
    expect(PropertyTypeRegistry.list().map((d) => d.key).sort()).toEqual(
      [...REGISTERED_KEYS].sort(),
    );
  });

  it('every entry has the full contract (§11D.3)', () => {
    for (const def of PropertyTypeRegistry.list()) {
      expect(typeof def.sortComparator).toBe('function');
      expect(typeof def.toCsv).toBe('function');
      expect(typeof def.toPlainText).toBe('function');
      expect(def.filterOperators.length).toBeGreaterThan(0);
      expect(def.calculations.length).toBeGreaterThan(0);
    }
  });

  it('number sorts numerically, not lexicographically', () => {
    const def = PropertyTypeRegistry.get('number')!;
    expect(def.sortComparator(2, 10)).toBeLessThan(0);
  });

  it('checkbox toCsv/toPlainText normalize to a boolean string', () => {
    const def = PropertyTypeRegistry.get('checkbox')!;
    expect(def.toCsv(undefined)).toBe('false');
    expect(def.toCsv(true)).toBe('true');
  });

  it('text toCsv escapes commas and quotes', () => {
    const def = PropertyTypeRegistry.get('text')!;
    expect(def.toCsv('a, "b"')).toBe('"a, ""b"""');
  });
});

describe('rowToPlainText', () => {
  it('joins every cell using its own property type serializer', () => {
    const row = {
      id: 'r1',
      databaseId: 'db',
      pageId: null,
      values: { title: 'Alpha', done: true, count: 3 },
      position: 0,
      createdAt: '',
      updatedAt: '',
    };
    const properties = [
      { id: 'title', type: 'title' as const },
      { id: 'done', type: 'checkbox' as const },
      { id: 'count', type: 'number' as const },
    ];
    expect(rowToPlainText(row, properties)).toBe('Alpha true 3');
  });
});
