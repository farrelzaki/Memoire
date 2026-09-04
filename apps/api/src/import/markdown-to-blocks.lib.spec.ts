import { describe, expect, it } from 'vitest';
import { guessTitleFromMarkdown, parseMarkdownToBlocks } from './markdown-to-blocks.lib';

/**
 * Fixtures below are markdown strings written to exactly match what
 * `apps/web/features/editor/block-type-registry.ts`'s `toMarkdown` would
 * produce for the corresponding node — this parser is the symmetric
 * counterpart (ADR-24/ADR-25: no shared module, frontend-only registry).
 * Each test asserts the parser reconstructs the equivalent Tiptap node.
 */

describe('parseMarkdownToBlocks — single blocks', () => {
  it('parses a plain paragraph', () => {
    expect(parseMarkdownToBlocks('hello world')).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'hello world' }] },
    ]);
  });

  it('parses bold/italic/strike/code/highlight marks', () => {
    expect(parseMarkdownToBlocks('**bold** *italic* ~~strike~~ `code` ==highlight==')).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
          { type: 'text', text: ' ' },
          { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
          { type: 'text', text: ' ' },
          { type: 'text', text: 'strike', marks: [{ type: 'strike' }] },
          { type: 'text', text: ' ' },
          { type: 'text', text: 'code', marks: [{ type: 'code' }] },
          { type: 'text', text: ' ' },
          { type: 'text', text: 'highlight', marks: [{ type: 'highlight' }] },
        ],
      },
    ]);
  });

  it('parses a link', () => {
    expect(parseMarkdownToBlocks('[text](https://example.com)')).toEqual([
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'text', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] }],
      },
    ]);
  });

  it('parses an inline equation', () => {
    expect(parseMarkdownToBlocks('E = $mc^2$ always')).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'E = ' },
          { type: 'inlineEquation', attrs: { latex: 'mc^2' } },
          { type: 'text', text: ' always' },
        ],
      },
    ]);
  });

  it('parses headings 1-6', () => {
    for (let level = 1; level <= 6; level++) {
      const md = `${'#'.repeat(level)} Title`;
      expect(parseMarkdownToBlocks(md)).toEqual([
        { type: 'heading', attrs: { level }, content: [{ type: 'text', text: 'Title' }] },
      ]);
    }
  });

  it('parses a bullet list', () => {
    expect(parseMarkdownToBlocks('- one\n- two')).toEqual([
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }] },
        ],
      },
    ]);
  });

  it('parses an ordered list', () => {
    expect(parseMarkdownToBlocks('1. one\n2. two')).toEqual([
      {
        type: 'orderedList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }] },
        ],
      },
    ]);
  });

  it('parses a task list, checked and unchecked', () => {
    expect(parseMarkdownToBlocks('[ ] todo\n[x] done')).toEqual([
      {
        type: 'taskList',
        content: [
          {
            type: 'taskItem',
            attrs: { checked: false },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'todo' }] }],
          },
          {
            type: 'taskItem',
            attrs: { checked: true },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'done' }] }],
          },
        ],
      },
    ]);
  });

  it('also accepts GFM-style task lists with a leading dash (external Markdown files)', () => {
    expect(parseMarkdownToBlocks('- [ ] todo\n- [x] done')).toEqual([
      {
        type: 'taskList',
        content: [
          {
            type: 'taskItem',
            attrs: { checked: false },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'todo' }] }],
          },
          {
            type: 'taskItem',
            attrs: { checked: true },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'done' }] }],
          },
        ],
      },
    ]);
  });

  it('parses a blockquote', () => {
    expect(parseMarkdownToBlocks('> quoted line')).toEqual([
      { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'quoted line' }] }] },
    ]);
  });

  it('parses a fenced code block with language', () => {
    expect(parseMarkdownToBlocks('```ts\nconst x = 1;\n```')).toEqual([
      { type: 'codeBlock', attrs: { language: 'ts' }, content: [{ type: 'text', text: 'const x = 1;' }] },
    ]);
  });

  it('parses a horizontal rule', () => {
    expect(parseMarkdownToBlocks('---')).toEqual([{ type: 'horizontalRule' }]);
  });

  it('parses an image', () => {
    expect(parseMarkdownToBlocks('![alt text](https://example.com/x.png)')).toEqual([
      { type: 'image', attrs: { src: 'https://example.com/x.png', alt: 'alt text' } },
    ]);
  });

  it('parses a GFM table', () => {
    const md = '| A | B |\n| --- | --- |\n| 1 | 2 |';
    expect(parseMarkdownToBlocks(md)).toEqual([
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }] },
              { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }] },
            ],
          },
          {
            type: 'tableRow',
            content: [
              { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '1' }] }] },
              { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '2' }] }] },
            ],
          },
        ],
      },
    ]);
  });

  it('preserves an unrecognized raw HTML block as a code block, never dropped (§30A.3)', () => {
    const html = '<div class="custom">raw</div>';
    expect(parseMarkdownToBlocks(html)).toEqual([
      { type: 'codeBlock', attrs: { language: '' }, content: [{ type: 'text', text: html }] },
    ]);
  });
});

describe('parseMarkdownToBlocks — multi-block documents', () => {
  it('splits multiple blank-line-separated blocks', () => {
    const md = '# Title\n\nSome text.\n\n- a\n- b';
    const blocks = parseMarkdownToBlocks(md);
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'bulletList']);
  });

  it('keeps a fenced code block intact even with blank lines inside it', () => {
    const md = '```\nline one\n\nline two\n```';
    const blocks = parseMarkdownToBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('codeBlock');
    expect(blocks[0].content?.[0].text).toBe('line one\n\nline two');
  });
});

describe('guessTitleFromMarkdown', () => {
  it('strips a leading heading marker for the title', () => {
    expect(guessTitleFromMarkdown('# My Page\n\nBody')).toBe('My Page');
  });

  it('falls back to the first non-empty line when there is no heading', () => {
    expect(guessTitleFromMarkdown('\n\nJust text')).toBe('Just text');
  });

  it('falls back to "Untitled" for an empty document', () => {
    expect(guessTitleFromMarkdown('')).toBe('Untitled');
  });
});
