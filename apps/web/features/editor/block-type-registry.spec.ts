import { describe, expect, it } from 'vitest';
import { BlockTypeRegistry, countWords } from './block-type-registry';

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
  'callout',
  'toggle',
  'table',
  'tableRow',
  'tableHeader',
  'tableCell',
  'columns',
  'column',
  'equation',
  'subPage',
  'linkToPage',
  'breadcrumb',
  'tableOfContents',
  'syncedBlock',
  'fileBlock',
  'video',
  'audio',
  'pdf',
  'bookmark',
  'embed',
  'databaseView',
];

function text(value: string, marks?: Array<{ type: string; attrs?: Record<string, unknown> }>) {
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

  it('paragraph serializes underline/subscript/superscript to html only (§12A.5)', () => {
    const def = BlockTypeRegistry.get('paragraph')!;
    const node = {
      type: 'paragraph',
      content: [
        text('u', [{ type: 'underline' }]),
        text('sub', [{ type: 'subscript' }]),
        text('sup', [{ type: 'superscript' }]),
      ],
    };
    expect(def.toHtml(node)).toBe('<p><u>u</u><sub>sub</sub><sup>sup</sup></p>');
    // No Markdown syntax for these — text survives, formatting doesn't.
    expect(def.toMarkdown(node)).toBe('usubsup');
    expect(def.toPlainText(node)).toBe('usubsup');
  });

  it('paragraph serializes highlight to ==x== markdown and a colored <mark> in html', () => {
    const def = BlockTypeRegistry.get('paragraph')!;
    const plain = { type: 'paragraph', content: [text('hi', [{ type: 'highlight' }])] };
    expect(def.toHtml(plain)).toBe('<p><mark>hi</mark></p>');
    expect(def.toMarkdown(plain)).toBe('==hi==');

    const colored = {
      type: 'paragraph',
      content: [text('hi', [{ type: 'highlight', attrs: { color: 'hsl(var(--mark-bg-yellow))' } }])],
    };
    expect(def.toHtml(colored)).toBe(
      '<p><mark style="background-color: hsl(var(--mark-bg-yellow)); color: inherit">hi</mark></p>',
    );
  });

  it('paragraph serializes textStyle color to html only (no markdown syntax)', () => {
    const def = BlockTypeRegistry.get('paragraph')!;
    const node = {
      type: 'paragraph',
      content: [text('hi', [{ type: 'textStyle', attrs: { color: 'hsl(var(--mark-fg-red))' } }])],
    };
    expect(def.toHtml(node)).toBe('<p><span style="color: hsl(var(--mark-fg-red))">hi</span></p>');
    expect(def.toMarkdown(node)).toBe('hi');
  });

  it('paragraph serializes link marks to <a> html and [text](href) markdown', () => {
    const def = BlockTypeRegistry.get('paragraph')!;
    const external = {
      type: 'paragraph',
      content: [text('site', [{ type: 'link', attrs: { href: 'https://example.com' } }])],
    };
    expect(def.toHtml(external)).toBe(
      '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer">site</a></p>',
    );
    expect(def.toMarkdown(external)).toBe('[site](https://example.com)');

    const internal = {
      type: 'paragraph',
      content: [text('Other page', [{ type: 'link', attrs: { href: '/abc-123' } }])],
    };
    expect(def.toHtml(internal)).toBe('<p><a href="/abc-123">Other page</a></p>');
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

  it('image prefers the caption over alt text when both are set', () => {
    const def = BlockTypeRegistry.get('image')!;
    const node = { type: 'image', attrs: { src: '/x.png', alt: 'A cat', caption: 'My cat Steve' } };
    expect(def.toPlainText(node)).toBe('My cat Steve');
    expect(def.toMarkdown(node)).toBe('![A cat](/x.png)\n*My cat Steve*');
    expect(def.toHtml(node)).toBe('<figure><img src="/x.png" alt="A cat"><figcaption>My cat Steve</figcaption></figure>');
  });

  it('image full-bleed renders full width, ignoring align', () => {
    const def = BlockTypeRegistry.get('image')!;
    const node = { type: 'image', attrs: { src: '/x.png', alt: '', fullBleed: true, align: 'left' } };
    expect(def.toHtml(node)).toBe('<img src="/x.png" alt="" style="width:100%">');
  });

  it('image with a custom width and non-center align sets inline style', () => {
    const def = BlockTypeRegistry.get('image')!;
    const node = { type: 'image', attrs: { src: '/x.png', alt: '', width: 240, align: 'left' } };
    expect(def.toHtml(node)).toBe(
      '<img src="/x.png" alt="" style="display:block;margin-left:0;margin-right:auto;width:240px">',
    );
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

  it('callout serializes icon + nested block content', () => {
    const def = BlockTypeRegistry.get('callout')!;
    const node = {
      type: 'callout',
      attrs: { icon: '⚠️' },
      content: [{ type: 'paragraph', content: [text('careful')] }],
    };
    expect(def.toHtml(node)).toBe('<div data-type="callout"><span>⚠️</span><div><p>careful</p></div></div>');
    expect(def.toMarkdown(node)).toBe('> ⚠️ careful');
    expect(def.toPlainText(node)).toBe('careful');
  });

  it('callout defaults to a lightbulb icon', () => {
    const def = BlockTypeRegistry.get('callout')!;
    const node = { type: 'callout', content: [{ type: 'paragraph', content: [text('note')] }] };
    expect(def.toMarkdown(node)).toBe('> 💡 note');
  });

  it('toggle serializes the first child as the always-visible summary', () => {
    const def = BlockTypeRegistry.get('toggle')!;
    const node = {
      type: 'toggle',
      content: [
        { type: 'paragraph', content: [text('Summary')] },
        { type: 'paragraph', content: [text('Hidden body')] },
      ],
    };
    expect(def.toHtml(node)).toBe('<details><summary>Summary</summary><p>Hidden body</p></details>');
    expect(def.toMarkdown(node)).toBe('Summary\nHidden body');
    expect(def.toPlainText(node)).toBe('Summary\nHidden body');
  });

  it('toggle with headingLevel prefixes the summary with # in markdown', () => {
    const def = BlockTypeRegistry.get('toggle')!;
    const node = {
      type: 'toggle',
      attrs: { headingLevel: 2 },
      content: [{ type: 'paragraph', content: [text('Section')] }],
    };
    expect(def.toMarkdown(node)).toBe('## Section');
  });

  function tableRow(...cells: string[]) {
    return {
      type: 'tableRow',
      content: cells.map((c) => ({ type: 'tableCell', content: [{ type: 'paragraph', content: [text(c)] }] })),
    };
  }

  it('table serializes to a GFM table in markdown, treating the first row as the header', () => {
    const def = BlockTypeRegistry.get('table')!;
    const node = { type: 'table', content: [tableRow('Name', 'Age'), tableRow('Ada', '30'), tableRow('Grace', '40')] };
    expect(def.toMarkdown(node)).toBe(
      '| Name | Age |\n| --- | --- |\n| Ada | 30 |\n| Grace | 40 |',
    );
    expect(def.toPlainText(node)).toBe('Name\tAge\nAda\t30\nGrace\t40');
  });

  it('table serializes to a real <table> in html', () => {
    const def = BlockTypeRegistry.get('table')!;
    const node = { type: 'table', content: [tableRow('A', 'B')] };
    expect(def.toHtml(node)).toBe('<table><tr><td><p>A</p></td><td><p>B</p></td></tr></table>');
  });

  it('table with no rows serializes to an empty markdown string', () => {
    const def = BlockTypeRegistry.get('table')!;
    expect(def.toMarkdown({ type: 'table', content: [] })).toBe('');
  });

  it('equation round-trips the raw LaTeX source', () => {
    const def = BlockTypeRegistry.get('equation')!;
    const node = { type: 'equation', attrs: { latex: 'E = mc^2' } };
    expect(def.toMarkdown(node)).toBe('$$E = mc^2$$');
    expect(def.toPlainText(node)).toBe('E = mc^2');
    expect(def.toHtml(node)).toBe('<div data-type="equation">$$E = mc^2$$</div>');
  });

  it('syncedBlock (source) serializes its own children', () => {
    const def = BlockTypeRegistry.get('syncedBlock')!;
    const node = {
      type: 'syncedBlock',
      attrs: { sourceBlockId: null },
      content: [{ type: 'paragraph', content: [text('hello')] }],
    };
    expect(def.toPlainText(node)).toBe('hello');
    expect(def.toMarkdown(node)).toBe('hello');
    expect(def.toHtml(node)).toBe('<div data-type="synced-block"><p>hello</p></div>');
  });

  it('syncedBlock (copy) has no content to serialize on its own', () => {
    const def = BlockTypeRegistry.get('syncedBlock')!;
    const node = { type: 'syncedBlock', attrs: { sourceBlockId: 'abc-123' }, content: [] };
    expect(def.toPlainText(node)).toBe('');
    expect(def.toMarkdown(node)).toBe('');
    expect(def.toHtml(node)).toBe('<div data-type="synced-block">Synced content</div>');
  });

  it('file block serializes a download link from an uploaded attachment', () => {
    const def = BlockTypeRegistry.get('fileBlock')!;
    const node = { type: 'fileBlock', attrs: { attachmentId: 'att-1', filename: 'report.pdf' } };
    expect(def.toPlainText(node)).toBe('report.pdf');
    expect(def.toMarkdown(node)).toContain('[report.pdf](');
    expect(def.toHtml(node)).toContain('report.pdf</a>');
  });

  it('file block serializes nothing when neither an attachment nor a URL is set', () => {
    const def = BlockTypeRegistry.get('fileBlock')!;
    const node = { type: 'fileBlock', attrs: {} };
    expect(def.toHtml(node)).toBe('');
    expect(def.toMarkdown(node)).toBe('');
  });

  it('video block renders a <video> tag from a pasted URL', () => {
    const def = BlockTypeRegistry.get('video')!;
    const node = { type: 'video', attrs: { url: 'https://example.com/clip.mp4' } };
    expect(def.toHtml(node)).toBe('<video src="https://example.com/clip.mp4" controls></video>');
  });

  it('bookmark serializes a link, preferring the fetched title', () => {
    const def = BlockTypeRegistry.get('bookmark')!;
    const node = { type: 'bookmark', attrs: { url: 'https://example.com', title: 'Example Site' } };
    expect(def.toPlainText(node)).toBe('Example Site');
    expect(def.toMarkdown(node)).toBe('[Example Site](https://example.com)');
    expect(def.toHtml(node)).toBe('<a href="https://example.com" data-type="bookmark">Example Site</a>');
  });

  it('bookmark falls back to the raw URL when no title was fetched yet', () => {
    const def = BlockTypeRegistry.get('bookmark')!;
    const node = { type: 'bookmark', attrs: { url: 'https://example.com' } };
    expect(def.toPlainText(node)).toBe('https://example.com');
  });

  it('embed serializes a sandboxed iframe', () => {
    const def = BlockTypeRegistry.get('embed')!;
    const node = { type: 'embed', attrs: { url: 'https://example.com/widget' } };
    expect(def.toHtml(node)).toContain('sandbox="allow-scripts allow-same-origin allow-popups"');
    expect(def.toMarkdown(node)).toBe('[Embed](https://example.com/widget)');
    expect(def.toPlainText(node)).toBe('');
  });

  it('databaseView has no plain-text content — the live table can\'t be resolved in a serializer', () => {
    const def = BlockTypeRegistry.get('databaseView')!;
    const node = { type: 'databaseView', attrs: { databaseId: 'db-1', mode: 'inline' } };
    expect(def.toPlainText(node)).toBe('');
    expect(def.toMarkdown(node)).toBe('');
    expect(def.toHtml(node)).toContain('data-mode="inline"');
  });

  it('paragraph serializes an inline equation node inside its text run', () => {
    const def = BlockTypeRegistry.get('paragraph')!;
    const node = {
      type: 'paragraph',
      content: [text('The answer is '), { type: 'inlineEquation', attrs: { latex: '42' } }],
    };
    expect(def.toMarkdown(node)).toBe('The answer is $42$');
    expect(def.toPlainText(node)).toBe('The answer is 42');
    expect(def.toHtml(node)).toBe('<p>The answer is <span data-type="inline-equation">$42$</span></p>');
  });
});

describe('countWords', () => {
  it('sums plain-text word counts across top-level blocks', () => {
    const blocks = [
      { type: 'paragraph', content: { type: 'paragraph', content: [text('hello world')] } },
      { type: 'heading', content: { type: 'heading', attrs: { level: 1 }, content: [text('one two three')] } },
    ];
    expect(countWords(blocks)).toBe(5);
  });

  it('ignores blocks with no content and unknown types', () => {
    expect(countWords([{ type: 'horizontalRule', content: null }])).toBe(0);
    expect(countWords([{ type: 'not-a-real-type', content: { type: 'not-a-real-type' } }])).toBe(0);
  });

  it('collapses runs of whitespace', () => {
    const blocks = [{ type: 'paragraph', content: { type: 'paragraph', content: [text('  a   b  c ')] } }];
    expect(countWords(blocks)).toBe(3);
  });
});
