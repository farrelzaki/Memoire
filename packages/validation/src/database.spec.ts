import { describe, expect, it } from 'vitest';
import { createPropertySchema } from './database';

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
});
