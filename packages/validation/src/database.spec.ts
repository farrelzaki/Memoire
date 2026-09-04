import { describe, expect, it } from 'vitest';
import { createPropertySchema, createViewSchema, reorderIntoGroupSchema, reorderSchema, viewTypes } from './database';

describe('createPropertySchema', () => {
  it('accepts a property with no config', () => {
    const result = createPropertySchema.safeParse({ name: 'Title', type: 'title' });
    expect(result.success).toBe(true);
  });

  it('accepts a select property with valid options', () => {
    const result = createPropertySchema.safeParse({
      name: 'Status',
      type: 'select',
      config: { options: [{ id: '11111111-1111-1111-1111-111111111111', name: 'Todo', color: '#ff0000' }] },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a select option with an invalid color', () => {
    const result = createPropertySchema.safeParse({
      name: 'Status',
      type: 'select',
      config: { options: [{ id: '11111111-1111-1111-1111-111111111111', name: 'Todo', color: 'red' }] },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a status option missing its group', () => {
    const result = createPropertySchema.safeParse({
      name: 'Status',
      type: 'status',
      config: {
        options: [{ id: '11111111-1111-1111-1111-111111111111', name: 'Todo', color: '#ff0000' }],
      },
    });
    expect(result.success).toBe(false);
  });

  it('accepts a unique_id property and defaults nextValue', () => {
    const result = createPropertySchema.safeParse({ name: 'Ref', type: 'unique_id', config: { prefix: 'TASK-' } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.config).toEqual({ prefix: 'TASK-', nextValue: 1 });
  });

  it('rejects unknown config keys for a strict type', () => {
    const result = createPropertySchema.safeParse({ name: 'Done', type: 'checkbox', config: { extra: true } });
    expect(result.success).toBe(false);
  });

  it('accepts a relation property and defaults allowMultiple/inversePropertyId', () => {
    const result = createPropertySchema.safeParse({
      name: 'Tasks',
      type: 'relation',
      config: { targetDatabaseId: '11111111-1111-1111-1111-111111111111' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.config).toEqual({
        targetDatabaseId: '11111111-1111-1111-1111-111111111111',
        allowMultiple: true,
        inversePropertyId: null,
      });
    }
  });

  it('accepts a rollup property with a valid function', () => {
    const result = createPropertySchema.safeParse({
      name: 'Total hours',
      type: 'rollup',
      config: {
        relationPropertyId: '11111111-1111-1111-1111-111111111111',
        targetPropertyId: '22222222-2222-2222-2222-222222222222',
        function: 'sum',
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a rollup property with an unknown function', () => {
    const result = createPropertySchema.safeParse({
      name: 'Total hours',
      type: 'rollup',
      config: {
        relationPropertyId: '11111111-1111-1111-1111-111111111111',
        targetPropertyId: '22222222-2222-2222-2222-222222222222',
        function: 'not_a_function',
      },
    });
    expect(result.success).toBe(false);
  });

  it('accepts a formula property with just a source string — ast/volatile/returnType default', () => {
    const result = createPropertySchema.safeParse({
      name: 'Total',
      type: 'formula',
      config: { source: 'prop("Price") * prop("Qty")' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.config).toMatchObject({ source: 'prop("Price") * prop("Qty")', volatile: false, returnType: 'unknown' });
    }
  });

  it('rejects a formula property with no source', () => {
    const result = createPropertySchema.safeParse({ name: 'Total', type: 'formula', config: {} });
    expect(result.success).toBe(false);
  });
});

describe('viewTypes / createViewSchema', () => {
  it('includes list and timeline (Sprint 21)', () => {
    expect(viewTypes).toContain('list');
    expect(viewTypes).toContain('timeline');
  });

  it('accepts a list view and a timeline view', () => {
    expect(createViewSchema.safeParse({ name: 'My List', type: 'list' }).success).toBe(true);
    expect(createViewSchema.safeParse({ name: 'My Timeline', type: 'timeline' }).success).toBe(true);
  });
});

describe('reorderSchema / reorderIntoGroupSchema', () => {
  const id = '11111111-1111-1111-1111-111111111111';

  it('accepts null anchors for start/end-of-list drops', () => {
    expect(reorderSchema.safeParse({ beforeId: null, afterId: null }).success).toBe(true);
    expect(reorderSchema.safeParse({ beforeId: id, afterId: null }).success).toBe(true);
  });

  it('rejects a non-uuid anchor', () => {
    expect(reorderSchema.safeParse({ beforeId: 'not-a-uuid', afterId: null }).success).toBe(false);
  });

  it('accepts a reorder-into-group body with an arbitrary groupValue', () => {
    const result = reorderIntoGroupSchema.safeParse({
      groupPropertyId: id,
      groupValue: 'some-option-id',
      beforeId: null,
      afterId: null,
    });
    expect(result.success).toBe(true);
  });
});
