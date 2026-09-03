import { describe, expect, it } from 'vitest';
import { createPropertySchema, updateRowSchema } from './databases.schema';

describe('createPropertySchema', () => {
  it('accepts a valid property, filling per-type config defaults', () => {
    const result = createPropertySchema.parse({ name: 'Status', type: 'select' });
    expect(result).toEqual({ name: 'Status', type: 'select', config: { options: [] } });
  });

  it('rejects an unknown property type', () => {
    expect(() => createPropertySchema.parse({ name: 'X', type: 'relation' })).toThrow();
  });

  it('rejects a blank name', () => {
    expect(() => createPropertySchema.parse({ name: '  ', type: 'text' })).toThrow();
  });
});

describe('updateRowSchema', () => {
  it('accepts a values object', () => {
    const result = updateRowSchema.parse({ values: { a: 1, b: 'x' } });
    expect(result.values).toEqual({ a: 1, b: 'x' });
  });

  it('rejects a missing values object', () => {
    expect(() => updateRowSchema.parse({})).toThrow();
  });
});
