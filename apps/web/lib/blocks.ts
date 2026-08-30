import type { Block, TiptapNode } from './types';

export interface TiptapDocument {
  type: 'doc';
  content: TiptapNode[];
}

/** Reconstruct a Tiptap document from ordered blocks (each `content` is a node). */
export function blocksToDoc(blocks: Block[]): TiptapDocument {
  return {
    type: 'doc',
    content: blocks
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((b) => b.content)
      .filter((c): c is TiptapNode => c !== null),
  };
}

export interface BlockPayload {
  type: string;
  content: TiptapNode;
}

/** Split a Tiptap document into an ordered list of block payloads. */
export function docToBlocks(doc: TiptapDocument): BlockPayload[] {
  return doc.content.map((node) => ({
    type: node.type ?? 'paragraph',
    content: node,
  }));
}
