import { getSchema } from '@tiptap/core';
import { EditorState } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';
import { assignBlockIds, BlockId } from './block-id';

const schema = getSchema([StarterKit, BlockId]);

function docFrom(json: Record<string, unknown>) {
  return schema.nodeFromJSON(json);
}

function blockIdsOf(node: ReturnType<typeof docFrom>): unknown[] {
  const ids: unknown[] = [];
  node.descendants((child) => {
    if ('blockId' in child.attrs) ids.push(child.attrs.blockId);
  });
  return ids;
}

describe('assignBlockIds', () => {
  it('assigns an id to every block-level node missing one', () => {
    const doc = docFrom({
      type: 'doc',
      content: [{ type: 'paragraph' }, { type: 'heading', attrs: { level: 1 } }],
    });
    const tr = EditorState.create({ schema, doc }).tr;

    const changed = assignBlockIds(tr, doc);

    expect(changed).toBe(true);
    const ids = blockIdsOf(tr.doc);
    expect(ids).toHaveLength(2);
    for (const id of ids) {
      expect(typeof id).toBe('string');
      expect(id).not.toBe('');
    }
    expect(new Set(ids).size).toBe(2);
  });

  it('reassigns a fresh id to a duplicate, keeping the first occurrence stable', () => {
    const doc = docFrom({
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { blockId: 'dup' } },
        { type: 'paragraph', attrs: { blockId: 'dup' } },
      ],
    });
    const tr = EditorState.create({ schema, doc }).tr;

    const changed = assignBlockIds(tr, doc);

    expect(changed).toBe(true);
    const ids = blockIdsOf(tr.doc);
    expect(ids[0]).toBe('dup');
    expect(ids[1]).not.toBe('dup');
    expect(ids[1]).toBeTruthy();
  });

  it('leaves a document with already-unique ids untouched', () => {
    const doc = docFrom({
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { blockId: 'a' } },
        { type: 'paragraph', attrs: { blockId: 'b' } },
      ],
    });
    const tr = EditorState.create({ schema, doc }).tr;

    const changed = assignBlockIds(tr, doc);

    expect(changed).toBe(false);
    expect(blockIdsOf(tr.doc)).toEqual(['a', 'b']);
  });

  it('does not assign ids to nodes without the attribute (e.g. text)', () => {
    const doc = docFrom({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }],
    });
    const tr = EditorState.create({ schema, doc }).tr;

    assignBlockIds(tr, doc);

    let textNodeSeen = false;
    tr.doc.descendants((node) => {
      if (node.isText) {
        textNodeSeen = true;
        expect('blockId' in node.attrs).toBe(false);
      }
    });
    expect(textNodeSeen).toBe(true);
  });
});
