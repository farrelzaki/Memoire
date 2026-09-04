import { describe, expect, it } from 'vitest';
import { buildNotionTree, resolveNotionLinks, stripNotionHash } from './notion-zip.lib';

describe('stripNotionHash', () => {
  it('strips a valid 32-hex-char hash suffix', () => {
    expect(stripNotionHash('Page Name a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4')).toEqual({
      title: 'Page Name',
      hash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
    });
  });

  it('lowercases the hash', () => {
    expect(stripNotionHash('Page A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4').hash).toBe(
      'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
    );
  });

  it('returns no hash for a plain name', () => {
    expect(stripNotionHash('Plain Page Name')).toEqual({ title: 'Plain Page Name', hash: null });
  });

  it('does not match a too-short hex run', () => {
    expect(stripNotionHash('Page abc123')).toEqual({ title: 'Page abc123', hash: null });
  });
});

describe('buildNotionTree', () => {
  const encoder = new TextEncoder();

  it('builds a tree from hash-suffixed .md files, stripping hashes from titles', () => {
    const { tree, hashToNode } = buildNotionTree({
      'Root Page a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4.md': encoder.encode('# Root\n\nHello.'),
    });
    expect(tree).toHaveLength(1);
    expect(tree[0].title).toBe('Root Page');
    expect(tree[0].hash).toBe('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4');
    expect(hashToNode.get('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4')).toBe(tree[0]);
  });

  it('nests pages by folder hierarchy', () => {
    const { tree } = buildNotionTree({
      'Folder/Child.md': encoder.encode('# Child'),
    });
    expect(tree).toHaveLength(1);
    expect(tree[0].title).toBe('Folder');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].title).toBe('Child');
  });

  it('attaches a CSV to the folder node with the same stripped title, as a database', () => {
    const { tree } = buildNotionTree({
      'Tasks a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4/Item One.md': encoder.encode('# Item One'),
      'Tasks a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4.csv': encoder.encode('Name,Done\nItem One,true'),
    });
    expect(tree).toHaveLength(1);
    expect(tree[0].title).toBe('Tasks');
    expect(tree[0].database).not.toBeNull();
    expect(tree[0].database!.headers).toEqual(['Name', 'Done']);
    expect(tree[0].database!.columnTypes).toEqual(['title', 'checkbox']);
    expect(tree[0].children.map((c) => c.title)).toEqual(['Item One']);
  });

  it('ignores non-.md/.csv entries', () => {
    const { tree } = buildNotionTree({ 'image.png': encoder.encode('binary') });
    expect(tree).toHaveLength(0);
  });
});

describe('resolveNotionLinks', () => {
  it('rewrites a resolvable hash-suffixed link to the new page id', () => {
    const node = {
      type: 'text',
      text: 'see',
      marks: [{ type: 'link', attrs: { href: 'Other%20Page%20a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4.md' } }],
    };
    const hashToPageId = new Map([['a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', 'new-page-id']]);
    const warnings: string[] = [];
    const result = resolveNotionLinks(node, hashToPageId, warnings);
    expect(result.marks?.[0].attrs?.href).toBe('/new-page-id');
    expect(warnings).toEqual([]);
  });

  it('leaves an unresolvable hash-suffixed link untouched and warns', () => {
    const node = {
      type: 'text',
      text: 'see',
      marks: [{ type: 'link', attrs: { href: 'Missing%20Page%20ffffffffffffffffffffffffffffffff.md' } }],
    };
    const warnings: string[] = [];
    const result = resolveNotionLinks(node, new Map(), warnings);
    expect(result.marks?.[0].attrs?.href).toBe('Missing%20Page%20ffffffffffffffffffffffffffffffff.md');
    expect(warnings.length).toBe(1);
  });

  it('leaves an ordinary external link untouched', () => {
    const node = { type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] };
    const warnings: string[] = [];
    const result = resolveNotionLinks(node, new Map(), warnings);
    expect(result.marks?.[0].attrs?.href).toBe('https://example.com');
    expect(warnings).toEqual([]);
  });

  it('recurses into nested content', () => {
    const node = {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'see',
          marks: [{ type: 'link', attrs: { href: 'Other a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4.md' } }],
        },
      ],
    };
    const hashToPageId = new Map([['a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', 'resolved-id']]);
    const result = resolveNotionLinks(node, hashToPageId, []);
    expect(result.content?.[0].marks?.[0].attrs?.href).toBe('/resolved-id');
  });
});
