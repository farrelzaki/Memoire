import { describe, expect, it } from 'vitest';
import { createPageSchema, movePageSchema, updatePageSchema } from './pages.schema';

describe('createPageSchema', () => {
  it('applies default title and type', () => {
    const result = createPageSchema.parse({});
    expect(result.title).toBe('Untitled');
    expect(result.type).toBe('document');
  });

  it('rejects a blank title', () => {
    expect(() => createPageSchema.parse({ title: '   ' })).toThrow();
  });

  it('rejects an invalid parent page id', () => {
    expect(() => createPageSchema.parse({ parentPageId: 'not-a-uuid' })).toThrow();
  });

  it('rejects an unknown page type', () => {
    expect(() => createPageSchema.parse({ type: 'kanban' })).toThrow();
  });
});

describe('updatePageSchema', () => {
  it('rejects an empty update', () => {
    expect(() => updatePageSchema.parse({})).toThrow();
  });

  it('accepts a title change', () => {
    expect(updatePageSchema.parse({ title: 'New title' })).toMatchObject({
      title: 'New title',
    });
  });
});

describe('movePageSchema', () => {
  it('accepts a null parent (move to root)', () => {
    expect(movePageSchema.parse({ parentPageId: null })).toEqual({
      parentPageId: null,
    });
  });

  it('accepts explicit beforeId/afterId anchors', () => {
    const beforeId = '11111111-1111-1111-1111-111111111111';
    const afterId = '22222222-2222-2222-2222-222222222222';
    expect(movePageSchema.parse({ parentPageId: null, beforeId, afterId })).toEqual({
      parentPageId: null,
      beforeId,
      afterId,
    });
  });

  it('rejects a non-uuid anchor', () => {
    expect(() => movePageSchema.parse({ beforeId: 'not-a-uuid' })).toThrow();
  });
});
