import { describe, expect, it } from 'vitest';
import { searchHitSchema, searchQuerySchema } from './search';

describe('searchQuerySchema', () => {
  it('defaults mode to full, sort to relevance, and limit to 20', () => {
    const result = searchQuerySchema.parse({ q: 'hello' });
    expect(result).toMatchObject({ q: 'hello', mode: 'full', sort: 'relevance', limit: 20 });
  });

  it('rejects an empty query', () => {
    expect(() => searchQuerySchema.parse({ q: '' })).toThrow();
  });

  it('rejects a query over 200 characters', () => {
    expect(() => searchQuerySchema.parse({ q: 'a'.repeat(201) })).toThrow();
  });

  it('trims the query', () => {
    expect(searchQuerySchema.parse({ q: '  hello  ' }).q).toBe('hello');
  });

  it('accepts an explicit mode/type/timeRange/sort/limit', () => {
    const result = searchQuerySchema.parse({
      q: 'hello',
      mode: 'quick',
      type: 'database',
      timeRange: '7d',
      sort: 'updated',
      limit: 5,
    });
    expect(result).toMatchObject({
      mode: 'quick',
      type: 'database',
      timeRange: '7d',
      sort: 'updated',
      limit: 5,
    });
  });

  it('rejects an unknown type filter', () => {
    expect(() => searchQuerySchema.parse({ q: 'hello', type: 'spreadsheet' })).toThrow();
  });

  it('rejects a limit over 50', () => {
    expect(() => searchQuerySchema.parse({ q: 'hello', limit: 51 })).toThrow();
  });

  it('coerces a string limit (query params arrive as strings)', () => {
    expect(searchQuerySchema.parse({ q: 'hello', limit: '5' }).limit).toBe(5);
  });

  it('rejects a non-uuid locationPageId', () => {
    expect(() => searchQuerySchema.parse({ q: 'hello', locationPageId: 'not-a-uuid' })).toThrow();
  });
});

describe('searchHitSchema', () => {
  const base = {
    type: 'page' as const,
    pageId: '11111111-1111-1111-1111-111111111111',
    title: 'Untitled',
    breadcrumb: ['Root', 'Untitled'],
    snippet: null,
    rank: 0.5,
  };

  it('accepts a page hit with no block/row/database ids', () => {
    expect(searchHitSchema.parse(base)).toEqual(base);
  });

  it('accepts a block hit with a blockId', () => {
    const hit = { ...base, type: 'block' as const, blockId: '22222222-2222-2222-2222-222222222222' };
    expect(searchHitSchema.parse(hit)).toEqual(hit);
  });

  it('rejects an unknown type', () => {
    expect(() => searchHitSchema.parse({ ...base, type: 'comment' })).toThrow();
  });

  it('accepts a null snippet', () => {
    expect(searchHitSchema.parse({ ...base, snippet: null }).snippet).toBeNull();
  });
});
