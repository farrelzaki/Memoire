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
  id: string;
  type: string;
  content: TiptapNode;
}

/**
 * Split a Tiptap document into an ordered list of block payloads. Every
 * top-level node must already carry `attrs.blockId` — the editor's `BlockId`
 * extension assigns one to every node before it can reach here — since the
 * server upserts blocks by that id rather than regenerating identity on
 * every save (§11E.3).
 */
export function docToBlocks(doc: TiptapDocument): BlockPayload[] {
  return doc.content.map((node) => {
    const id = node.attrs?.blockId;
    if (typeof id !== 'string' || !id) {
      throw new Error(
        `Block of type "${node.type ?? 'unknown'}" is missing attrs.blockId — the BlockId extension must run before save`,
      );
    }
    return { id, type: node.type ?? 'paragraph', content: node };
  });
}
