import { describe, expect, it } from 'vitest';
import { BlockTypeRegistry } from './block-type-registry';

const REGISTERED_KEYS = [
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'taskList',
  'taskItem',
  'image',
  'mermaid',
];

function text(value: string, marks?: Array<{ type: string }>) {
  return { type: 'text', text: value, ...(marks ? { marks } : {}) };
}

describe('BlockTypeRegistry', () => {
  it('registers every block type currently wired into the editor', () => {
    expect(BlockTypeRegistry.list().map((d) => d.key).sort()).toEqual(
      [...REGISTERED_KEYS].sort(),
    );
  });

  it('every entry provides all three required serializers (§12B.6)', () => {
    for (const def of BlockTypeRegistry.list()) {
      expect(typeof def.toHtml).toBe('function');
      expect(typeof def.toMarkdown).toBe('function');
      expect(typeof def.toPlainText).toBe('function');
    }
  });

  it('paragraph serializes marks to html and markdown', () => {
    const def = BlockTypeRegistry.get('paragraph')!;
    const node = { type: 'paragraph', content: [text('hi', [{ type: 'bold' }])] };
    expect(def.toHtml(node)).toBe('<p><strong>hi</strong></p>');
    expect(def.toMarkdown(node)).toBe('**hi**');
    expect(def.toPlainText(node)).toBe('hi');
  });

  it('heading uses attrs.level', () => {
    const def = BlockTypeRegistry.get('heading')!;
    const node = { type: 'heading', attrs: { level: 2 }, content: [text('Title')] };
    expect(def.toHtml(node)).toBe('<h2>Title</h2>');
    expect(def.toMarkdown(node)).toBe('## Title');
  });

  it('bulletList delegates to nested listItem entries', () => {
    const def = BlockTypeRegistry.get('bulletList')!;
    const node = {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [text('one')] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [text('two')] }] },
      ],
    };
    expect(def.toHtml(node)).toBe('<ul><li><p>one</p></li><li><p>two</p></li></ul>');
    expect(def.toMarkdown(node)).toBe('- one\n- two');
    expect(def.toPlainText(node)).toBe('one\ntwo');
  });

  it('orderedList numbers its items', () => {
    const def = BlockTypeRegistry.get('orderedList')!;
    const node = {
      type: 'orderedList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [text('a')] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [text('b')] }] },
      ],
    };
    expect(def.toMarkdown(node)).toBe('1. a\n2. b');
  });

  it('taskItem reflects attrs.checked', () => {
    const def = BlockTypeRegistry.get('taskItem')!;
    const node = {
      type: 'taskItem',
      attrs: { checked: true },
      content: [{ type: 'paragraph', content: [text('done')] }],
    };
    expect(def.toMarkdown(node)).toBe('[x] done');
    expect(def.toHtml(node)).toContain('data-checked="true"');
  });

  it('codeBlock keeps raw text and language', () => {
    const def = BlockTypeRegistry.get('codeBlock')!;
    const node = { type: 'codeBlock', attrs: { language: 'ts' }, content: [text('let x = 1;')] };
    expect(def.toMarkdown(node)).toBe('```ts\nlet x = 1;\n```');
    expect(def.toPlainText(node)).toBe('let x = 1;');
  });

  it('image falls back to alt text for plain text extraction', () => {
    const def = BlockTypeRegistry.get('image')!;
    const node = { type: 'image', attrs: { src: '/x.png', alt: 'A cat' } };
    expect(def.toHtml(node)).toBe('<img src="/x.png" alt="A cat">');
    expect(def.toMarkdown(node)).toBe('![A cat](/x.png)');
    expect(def.toPlainText(node)).toBe('A cat');
  });

  it('mermaid round-trips the raw diagram source', () => {
    const def = BlockTypeRegistry.get('mermaid')!;
    const node = { type: 'mermaid', attrs: { code: 'graph TD;\n  A --> B;' } };
    expect(def.toPlainText(node)).toBe('graph TD;\n  A --> B;');
    expect(def.toMarkdown(node)).toBe('```mermaid\ngraph TD;\n  A --> B;\n```');
  });

  it('horizontalRule has no textual content', () => {
    const def = BlockTypeRegistry.get('horizontalRule')!;
    expect(def.toHtml({ type: 'horizontalRule' })).toBe('<hr>');
    expect(def.toPlainText({ type: 'horizontalRule' })).toBe('');
  });
});
