import { describe, expect, it } from 'vitest';
import { MermaidBlock } from './mermaid-node';
import { blocksToDoc, docToBlocks } from '@/lib/blocks';
import type { Block } from '@/lib/types';

describe('MermaidBlock node config', () => {
  it('is an atomic block node with a default diagram source', () => {
    expect(MermaidBlock.name).toBe('mermaid');
    expect(MermaidBlock.config.group).toBe('block');
    expect(MermaidBlock.config.atom).toBe(true);

    const addAttributes = MermaidBlock.config.addAttributes as (() => { code: { default: string } }) | undefined;
    const attrs = addAttributes?.call(MermaidBlock);
    expect(attrs?.code.default).toContain('graph TD');
  });

  it('round-trips through the generic block <-> doc conversion like any other block', () => {
    const block: Block = {
      id: 'm1',
      pageId: 'page',
      parentBlockId: null,
      type: 'mermaid',
      position: 0,
      content: { type: 'mermaid', attrs: { blockId: 'm1', code: 'graph TD;\nA-->B;' } },
      properties: null,
      createdAt: '',
      updatedAt: '',
    };

    const doc = blocksToDoc([block]);
    expect(doc.content[0]).toMatchObject({ type: 'mermaid', attrs: { blockId: 'm1', code: 'graph TD;\nA-->B;' } });

    const payloads = docToBlocks(doc);
    expect(payloads).toEqual([{ id: 'm1', type: 'mermaid', content: block.content }]);
  });
});
