import { describe, expect, it } from 'vitest';
import { blockPayloadSchema, replaceBlocksSchema, tiptapNodeSchema } from './block';

describe('tiptapNodeSchema', () => {
  it('accepts a nested node tree', () => {
    const node = {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }] },
      ],
    };
    expect(tiptapNodeSchema.parse(node)).toEqual(node);
  });

  it('passes through unknown attrs, including blockId', () => {
    const node = { type: 'paragraph', attrs: { blockId: 'abc', textAlign: 'left' } };
    expect(tiptapNodeSchema.parse(node)).toEqual(node);
  });
});

describe('blockPayloadSchema', () => {
  it('requires a UUID id', () => {
    expect(() =>
      blockPayloadSchema.parse({ id: 'not-a-uuid', type: 'paragraph' }),
    ).toThrow();
  });

  it('accepts a well-formed block', () => {
    const result = blockPayloadSchema.parse({
      id: '11111111-1111-1111-1111-111111111111',
      type: 'paragraph',
      content: { type: 'paragraph' },
    });
    expect(result.type).toBe('paragraph');
  });
});

describe('replaceBlocksSchema', () => {
  it('accepts an ordered list of blocks', () => {
    const body = {
      blocks: [
        { id: '11111111-1111-1111-1111-111111111111', type: 'paragraph' },
        { id: '22222222-2222-2222-2222-222222222222', type: 'heading' },
      ],
    };
    expect(replaceBlocksSchema.parse(body).blocks).toHaveLength(2);
  });
});
