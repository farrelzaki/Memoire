import { describe, expect, it } from 'vitest';
import { blockSchema, syncBlocksSchema } from './blocks.schema';

describe('blockSchema', () => {
  it('accepts a block with type and content', () => {
    const result = blockSchema.parse({
      type: 'paragraph',
      content: { type: 'paragraph', content: [{ type: 'text', text: 'hi' }] },
    });
    expect(result.type).toBe('paragraph');
  });

  it('accepts a block without content (e.g. divider)', () => {
    expect(blockSchema.parse({ type: 'horizontalRule' })).toEqual({
      type: 'horizontalRule',
    });
  });

  it('rejects an empty type', () => {
    expect(() => blockSchema.parse({ type: '   ' })).toThrow();
  });
});

describe('syncBlocksSchema', () => {
  it('accepts an array of blocks', () => {
    const result = syncBlocksSchema.parse({ blocks: [{ type: 'paragraph' }] });
    expect(result.blocks).toHaveLength(1);
  });

  it('rejects a missing blocks array', () => {
    expect(() => syncBlocksSchema.parse({})).toThrow();
  });
});
