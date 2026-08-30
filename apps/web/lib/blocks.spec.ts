import { describe, expect, it } from 'vitest';
import { blocksToDoc, docToBlocks } from './blocks';
import type { Block } from './types';

function makeBlock(partial: Partial<Block> & { id: string }): Block {
  return {
    pageId: 'page',
    parentBlockId: null,
    type: 'paragraph',
    position: 0,
    content: { type: 'paragraph' },
    properties: null,
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

describe('doc <-> blocks', () => {
  it('reconstructs a document from ordered blocks', () => {
    const a = makeBlock({ id: 'a', position: 0, content: { type: 'paragraph', content: [{ type: 'text', text: 'one' }] } });
    const b = makeBlock({ id: 'b', position: 1, content: { type: 'heading', attrs: { level: 1 } } });
    const doc = blocksToDoc([b, a]); // unsorted input
    expect(doc.type).toBe('doc');
    expect(doc.content).toHaveLength(2);
    expect(doc.content[0]).toMatchObject({ type: 'paragraph' });
    expect(doc.content[1]).toMatchObject({ type: 'heading' });
  });

  it('splits a document into ordered block payloads', () => {
    const doc = {
      type: 'doc' as const,
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'hi' }] },
        { type: 'horizontalRule' },
      ],
    };
    const blocks = docToBlocks(doc);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('paragraph');
    expect(blocks[1].type).toBe('horizontalRule');
  });

  it('round-trips without losing top-level nodes', () => {
    const doc = {
      type: 'doc' as const,
      content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'x' }] }],
    };
    const blocks = docToBlocks(doc);
    const payloadBlocks = blocks.map((b, i) =>
      makeBlock({ id: String(i), content: b.content }),
    );
    expect(blocksToDoc(payloadBlocks).content).toEqual(doc.content);
  });
});
