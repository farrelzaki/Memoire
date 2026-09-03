'use client';

import type { Content } from '@tiptap/core';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import Placeholder from '@tiptap/extension-placeholder';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import TextStyle from '@tiptap/extension-text-style';
import Underline from '@tiptap/extension-underline';
import { BubbleMenu, EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { api, attachmentContentUrl } from '@/lib/api';
import { blocksToDoc, docToBlocks, type TiptapDocument } from '@/lib/blocks';
import type { Block, TiptapNode } from '@/lib/types';
import { toast } from '@/stores/toast';
import { BlockId } from './block-id';
import { Bookmark } from './bookmark-node';
import { Breadcrumb } from './breadcrumb-node';
import { Callout } from './callout-node';
import { Column, Columns } from './columns-node';
import { Embed } from './embed-node';
import { Equation, InlineEquation } from './equation-node';
import { CodeBlockHighlight } from './code-block-highlight';
import { CodeBlockShiki } from './code-block-node';
import { ImageBlock } from './image-node';
import { LinkToPage } from './link-to-page-node';
import { AudioBlock, FileBlock, PdfBlock, VideoBlock } from './media-nodes';
import { BlockTypeRegistry } from './block-type-registry';
import { MARK_COLORS } from './mark-colors';
import { MermaidBlock } from './mermaid-node';
import { SubPage } from './sub-page-node';
import { SyncedBlock } from './synced-block-node';
import { TableOfContents } from './table-of-contents-node';
import { Toggle } from './toggle-node';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface SlashState {
  from: number;
  to: number;
  query: string;
}

interface BlockHandleState {
  pos: number;
  top: number;
  left: number;
}

function detectSlash(editor: Editor): SlashState | null {
  const { $from, empty } = editor.state.selection;
  if (!empty) return null;
  if (!$from.parent.isTextblock) return null;

  const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '\n');
  const match = textBefore.match(/(?:^|\s)\/([^\s/]*)$/);
  if (!match) return null;

  const slashIndex = textBefore.lastIndexOf('/');
  const from = $from.pos - $from.parentOffset + slashIndex;
  return { from, to: $from.pos, query: match[1] };
}

function getBlockHandle(editor: Editor): BlockHandleState | null {
  const { $from } = editor.state.selection;
  if ($from.depth < 1) return null;

  const pos = $from.before(1);
  try {
    const coords = editor.view.coordsAtPos(pos);
    return { pos, top: coords.top, left: coords.left };
  } catch {
    return null;
  }
}

interface TableHandleState {
  top: number;
  left: number;
  width: number;
}

/** Walks up from the selection looking for an ancestor `table` node — reading
 * its DOM rect directly (rather than `coordsAtPos`, which only knows about a
 * single text position) so the floating row/column toolbar spans the whole
 * table width, not just the current cell. */
function getTableHandle(editor: Editor): TableHandleState | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name !== 'table') continue;
    const pos = $from.before(depth);
    const dom = editor.view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) return null;
    const rect = dom.getBoundingClientRect();
    return { top: rect.top, left: rect.left, width: rect.width };
  }
  return null;
}

/** Top-level block boundary (position + line top) nearest a viewport point — used to
 * find both the block a drag is hovering over and where to insert on drop. */
function blockPosAtCoords(view: EditorView, x: number, y: number): { pos: number; top: number } | null {
  const found = view.posAtCoords({ left: x, top: y });
  if (!found) return null;
  const $pos = view.state.doc.resolve(found.pos);
  const pos = $pos.depth >= 1 ? $pos.before(1) : found.pos;
  try {
    const coords = view.coordsAtPos(pos);
    return { pos, top: coords.top };
  } catch {
    return null;
  }
}

/** Top-level blocks whose start position falls within [from, to] (inclusive,
 * order-independent) — the contiguous range a gutter drag-select spans. */
function blocksInRange(
  doc: ProseMirrorNode,
  from: number,
  to: number,
): Array<{ pos: number; node: ProseMirrorNode }> {
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  const result: Array<{ pos: number; node: ProseMirrorNode }> = [];
  doc.forEach((node, offset) => {
    if (offset >= start && offset <= end) result.push({ pos: offset, node });
  });
  return result;
}

/** Moves the top-level block at `sourcePos` so it sits right before `targetPos`.
 * Native ProseMirror move (delete + reinsert, positions remapped through the
 * transaction) — never dnd-kit, which can't be mounted inside the ProseMirror
 * content DOM (§CLAUDE.md, ADR-11). */
function moveBlock(view: EditorView, sourcePos: number, targetPos: number): void {
  const node = view.state.doc.nodeAt(sourcePos);
  if (!node) return;
  if (targetPos >= sourcePos && targetPos <= sourcePos + node.nodeSize) return; // dropped on itself

  const tr = view.state.tr;
  tr.delete(sourcePos, sourcePos + node.nodeSize);
  const mappedTarget = tr.mapping.map(targetPos);
  tr.insert(mappedTarget, node);
  view.dispatch(tr);
}

function DocumentEditor({ pageId }: { pageId: string }) {
  const { data: blocks, isLoading } = useQuery({
    queryKey: ['blocks', pageId],
    queryFn: () => api.listBlocks(pageId),
  });

  if (isLoading || !blocks) {
    return <div className="p-10 text-sm text-zinc-400">Loading…</div>;
  }
  return <EditorInstance key={pageId} pageId={pageId} initialBlocks={blocks} />;
}

const FONT_CLASSES: Record<string, string> = {
  serif: 'font-serif',
  mono: 'font-mono',
};

function EditorInstance({
  pageId,
  initialBlocks,
}: {
  pageId: string;
  initialBlocks: Block[];
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  // Shares the ['page', pageId] cache entry the page shell already populated
  // (app/[pageId]/page.tsx) — locked/font are page settings, not editor state.
  const { data: page } = useQuery({ queryKey: ['page', pageId], queryFn: () => api.getPage(pageId) });
  const locked = page?.settings.locked ?? false;
  const fontClass = page?.settings.font ? FONT_CLASSES[page.settings.font] : undefined;
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [slash, setSlash] = useState<SlashState | null>(null);
  const [blockHandle, setBlockHandle] = useState<BlockHandleState | null>(null);
  const [tableHandle, setTableHandle] = useState<TableHandleState | null>(null);
  const [blockMenuOpen, setBlockMenuOpen] = useState(false);
  const [dropIndicatorTop, setDropIndicatorTop] = useState<number | null>(null);
  const [multiSelect, setMultiSelect] = useState<{ from: number; to: number } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Mutable (not state) — read from editorProps closures captured at mount, which
  // would otherwise see a stale `blockHandle` from the render that created them.
  const dragSourcePosRef = useRef<number | null>(null);

  const uploadImage = useCallback(
    async (file: File): Promise<string> => {
      const attachment = await api.uploadAttachment(file, pageId);
      return attachmentContentUrl(attachment.id);
    },
    [pageId],
  );

  const pickImage = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const editor = useEditor({
    // The editor mounts inside a client component that Next still SSRs, so
    // rendering the document on the server would hydrate against a different
    // tree. Defer the first render to the client instead.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false }),
      CodeBlockShiki,
      CodeBlockHighlight,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: "Type '/' for commands" }),
      ImageBlock,
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Subscript,
      Superscript,
      Link.configure({
        openOnClick: false, // handled ourselves — internal links use router.push, external open in a new tab
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      MermaidBlock,
      Callout,
      Toggle,
      Columns,
      Column,
      Equation,
      InlineEquation,
      SubPage,
      LinkToPage,
      Breadcrumb.configure({ pageId }),
      TableOfContents,
      SyncedBlock,
      FileBlock.configure({ pageId }),
      VideoBlock.configure({ pageId }),
      AudioBlock.configure({ pageId }),
      PdfBlock.configure({ pageId }),
      Bookmark,
      Embed,
      BlockId,
    ],
    content: blocksToDoc(initialBlocks) as unknown as Content,
    editable: !locked,
    editorProps: {
      // Link clicks (§12A.2): `Link` is configured with `openOnClick: false` so
      // internal links (href starting with `/`) navigate via Next's router
      // instead of a hard page load; external links still open in a new tab.
      handleClick(view, pos, event) {
        const $pos = view.state.doc.resolve(pos);
        const linkMark = $pos.marks().find((m) => m.type.name === 'link');
        if (!linkMark) return false;
        const href = linkMark.attrs.href as string;
        if (!href) return false;
        event.preventDefault();
        if (href.startsWith('/')) {
          router.push(href);
        } else {
          window.open(href, '_blank', 'noopener,noreferrer');
        }
        return true;
      },
      handleDOMEvents: {
        dragover: (view, event) => {
          if (dragSourcePosRef.current === null) return false;
          event.preventDefault();
          const target = blockPosAtCoords(view, event.clientX, event.clientY);
          setDropIndicatorTop(target?.top ?? null);
          return true;
        },
        dragleave: () => {
          if (dragSourcePosRef.current === null) return false;
          setDropIndicatorTop(null);
          return false;
        },
      },
      handleDrop(view, event) {
        if (dragSourcePosRef.current !== null) {
          event.preventDefault();
          const sourcePos = dragSourcePosRef.current;
          const target = blockPosAtCoords(view, event.clientX, event.clientY);
          if (target) moveBlock(view, sourcePos, target.pos);
          dragSourcePosRef.current = null;
          setDropIndicatorTop(null);
          return true;
        }

        const file = Array.from(event.dataTransfer?.files ?? []).find((f) =>
          f.type.startsWith('image/'),
        );
        if (!file) return false;
        event.preventDefault();
        void uploadImage(file).then((url) => {
          const node = view.state.schema.nodes.image.create({ src: url });
          view.dispatch(view.state.tr.replaceSelectionWith(node));
        });
        return true;
      },
      handlePaste(view, event) {
        const file = Array.from(event.clipboardData?.files ?? []).find((f) =>
          f.type.startsWith('image/'),
        );
        if (!file) return false;
        event.preventDefault();
        void uploadImage(file).then((url) => {
          const node = view.state.schema.nodes.image.create({ src: url });
          view.dispatch(view.state.tr.replaceSelectionWith(node));
        });
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      setSaveState('saving');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          await api.replaceBlocks(pageId, docToBlocks(editor.getJSON() as unknown as TiptapDocument));
          setSaveState('saved');
        } catch {
          setSaveState('error');
        }
      }, 800);
    },
    onSelectionUpdate: ({ editor }) => {
      setSlash(detectSlash(editor));
      setBlockHandle(getBlockHandle(editor));
      setTableHandle(getTableHandle(editor));
      setBlockMenuOpen(false);
      // A real ProseMirror selection change means the user clicked into text —
      // the gutter drag-select never touches editor selection, so this only
      // fires for the interactions that should actually clear it.
      setMultiSelect(null);
    },
  });

  // Flush pending save on unmount (avoids losing the last keystroke).
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // Lock page (§71.8): toggled from the page menu while this editor is
  // already mounted, so `editable` at creation time isn't enough on its own.
  useEffect(() => {
    editor?.setEditable(!locked);
  }, [editor, locked]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMultiSelect(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const items = useMemo(
    () => [
      { title: 'Text', hint: 'Paragraph', run: () => editor?.chain().focus().setParagraph().run() },
      { title: 'Heading 1', hint: 'Large', run: () => editor?.chain().focus().setHeading({ level: 1 }).run() },
      { title: 'Heading 2', hint: 'Medium', run: () => editor?.chain().focus().setHeading({ level: 2 }).run() },
      { title: 'Heading 3', hint: 'Small', run: () => editor?.chain().focus().setHeading({ level: 3 }).run() },
      { title: 'Bulleted list', hint: '•', run: () => editor?.chain().focus().toggleBulletList().run() },
      { title: 'Numbered list', hint: '1.', run: () => editor?.chain().focus().toggleOrderedList().run() },
      { title: 'To-do', hint: '☑', run: () => editor?.chain().focus().toggleTaskList().run() },
      { title: 'Quote', hint: '"', run: () => editor?.chain().focus().toggleBlockquote().run() },
      { title: 'Code', hint: '</>', run: () => editor?.chain().focus().toggleCodeBlock().run() },
      { title: 'Divider', hint: '—', run: () => editor?.chain().focus().setHorizontalRule().run() },
      {
        title: 'Table',
        hint: '3×3',
        run: () =>
          editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      },
      ...[2, 3, 4, 5].map((n) => ({
        title: `${n} columns`,
        hint: 'Side by side',
        run: () =>
          editor
            ?.chain()
            .focus()
            .insertContent({
              type: 'columns',
              content: Array.from({ length: n }, () => ({
                type: 'column',
                content: [{ type: 'paragraph' }],
              })),
            })
            .run(),
      })),
      {
        title: 'Equation',
        hint: 'KaTeX',
        run: () => editor?.chain().focus().insertContent({ type: 'equation' }).run(),
      },
      {
        title: 'Callout',
        hint: '💡',
        run: () =>
          editor
            ?.chain()
            .focus()
            .insertContent({ type: 'callout', content: [{ type: 'paragraph' }] })
            .run(),
      },
      {
        title: 'Toggle list',
        hint: '▸',
        run: () =>
          editor
            ?.chain()
            .focus()
            .insertContent({ type: 'toggle', content: [{ type: 'paragraph' }] })
            .run(),
      },
      {
        title: 'Toggle heading 1',
        hint: '▸ Large',
        run: () =>
          editor
            ?.chain()
            .focus()
            .insertContent({ type: 'toggle', attrs: { headingLevel: 1 }, content: [{ type: 'paragraph' }] })
            .run(),
      },
      {
        title: 'Toggle heading 2',
        hint: '▸ Medium',
        run: () =>
          editor
            ?.chain()
            .focus()
            .insertContent({ type: 'toggle', attrs: { headingLevel: 2 }, content: [{ type: 'paragraph' }] })
            .run(),
      },
      {
        title: 'Toggle heading 3',
        hint: '▸ Small',
        run: () =>
          editor
            ?.chain()
            .focus()
            .insertContent({ type: 'toggle', attrs: { headingLevel: 3 }, content: [{ type: 'paragraph' }] })
            .run(),
      },
      {
        title: 'Image',
        hint: 'Upload',
        run: () => pickImage(),
      },
      {
        title: 'Image URL',
        hint: 'Link',
        run: () => {
          const url = window.prompt('Image URL');
          if (url) editor?.chain().focus().setImage({ src: url }).run();
        },
      },
      {
        title: 'Mermaid Diagram',
        hint: 'Diagram',
        run: () => editor?.chain().focus().insertContent({ type: 'mermaid' }).run(),
      },
      {
        title: 'Page',
        hint: 'Sub-page',
        run: async () => {
          const child = await api.createPage({ parentPageId: pageId, title: 'Untitled' });
          queryClient.invalidateQueries({ queryKey: ['pages'] });
          editor?.chain().focus().insertContent({ type: 'subPage', attrs: { pageId: child.id } }).run();
        },
      },
      {
        title: 'Link to page',
        hint: 'Reference',
        run: () => editor?.chain().focus().insertContent({ type: 'linkToPage' }).run(),
      },
      {
        title: 'Breadcrumb',
        hint: "Page's ancestor trail",
        run: () => editor?.chain().focus().insertContent({ type: 'breadcrumb' }).run(),
      },
      {
        title: 'Table of contents',
        hint: 'Outline',
        run: () => editor?.chain().focus().insertContent({ type: 'tableOfContents' }).run(),
      },
      {
        title: 'Synced block',
        hint: 'Reuse elsewhere',
        run: () =>
          editor
            ?.chain()
            .focus()
            .insertContent({ type: 'syncedBlock', content: [{ type: 'paragraph' }] })
            .run(),
      },
      {
        title: 'Synced block (existing)',
        hint: "Paste another block's id",
        run: () => {
          const sourceBlockId = window.prompt("Source block's id");
          if (sourceBlockId) {
            editor?.chain().focus().insertContent({ type: 'syncedBlock', attrs: { sourceBlockId } }).run();
          }
        },
      },
      {
        title: 'File',
        hint: 'Upload or link',
        run: () => editor?.chain().focus().insertContent({ type: 'fileBlock' }).run(),
      },
      {
        title: 'Video',
        hint: 'Upload or link',
        run: () => editor?.chain().focus().insertContent({ type: 'video' }).run(),
      },
      {
        title: 'Audio',
        hint: 'Upload or link',
        run: () => editor?.chain().focus().insertContent({ type: 'audio' }).run(),
      },
      {
        title: 'PDF',
        hint: 'Upload or link',
        run: () => editor?.chain().focus().insertContent({ type: 'pdf' }).run(),
      },
      {
        title: 'Bookmark',
        hint: 'Link preview',
        run: () => editor?.chain().focus().insertContent({ type: 'bookmark' }).run(),
      },
      {
        title: 'Embed',
        hint: 'Website',
        run: () => editor?.chain().focus().insertContent({ type: 'embed' }).run(),
      },
    ],
    [editor, pickImage, pageId, queryClient],
  );

  const filteredItems = slash
    ? items.filter((item) => item.title.toLowerCase().includes(slash.query.toLowerCase()))
    : [];

  const selectItem = useCallback(
    (run: () => void) => {
      if (!editor || !slash) return;
      editor.chain().focus().deleteRange({ from: slash.from, to: slash.to }).run();
      run();
      setSlash(null);
    },
    [editor, slash],
  );

  const duplicateBlock = useCallback(() => {
    if (!editor || !blockHandle) return;
    editor
      .chain()
      .focus()
      .command(({ tr, state }) => {
        const node = state.doc.nodeAt(blockHandle.pos);
        if (!node) return false;
        tr.insert(blockHandle.pos + node.nodeSize, node.copy());
        return true;
      })
      .run();
    setBlockMenuOpen(false);
  }, [editor, blockHandle]);

  const deleteBlock = useCallback(() => {
    if (!editor || !blockHandle) return;
    editor
      .chain()
      .focus()
      .command(({ tr, state }) => {
        const node = state.doc.nodeAt(blockHandle.pos);
        if (!node) return false;
        tr.delete(blockHandle.pos, blockHandle.pos + node.nodeSize);
        return true;
      })
      .run();
    setBlockMenuOpen(false);
  }, [editor, blockHandle]);

  const copyBlockLink = useCallback(() => {
    if (!editor || !blockHandle) return;
    const node = editor.state.doc.nodeAt(blockHandle.pos);
    const blockId = node?.attrs.blockId;
    if (typeof blockId === 'string' && blockId) {
      void navigator.clipboard.writeText(`${window.location.origin}/${pageId}#${blockId}`);
      toast({ description: 'Link to block copied' });
    }
    setBlockMenuOpen(false);
  }, [editor, blockHandle, pageId]);

  const copyBlockMarkdown = useCallback(() => {
    if (!editor || !blockHandle) return;
    const node = editor.state.doc.nodeAt(blockHandle.pos);
    if (node) {
      const markdown = BlockTypeRegistry.get(node.type.name)?.toMarkdown(
        node.toJSON() as TiptapNode,
      );
      if (markdown) {
        void navigator.clipboard.writeText(markdown);
        toast({ description: 'Block copied as Markdown' });
      }
    }
    setBlockMenuOpen(false);
  }, [editor, blockHandle]);

  const deleteMultiSelect = useCallback(() => {
    if (!editor || !multiSelect) return;
    const blocks = blocksInRange(editor.state.doc, multiSelect.from, multiSelect.to);
    if (blocks.length === 0) return;
    const first = blocks[0];
    const last = blocks[blocks.length - 1];
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.delete(first.pos, last.pos + last.node.nodeSize);
        return true;
      })
      .run();
    setMultiSelect(null);
  }, [editor, multiSelect]);

  const copyMultiSelectMarkdown = useCallback(() => {
    if (!editor || !multiSelect) return;
    const blocks = blocksInRange(editor.state.doc, multiSelect.from, multiSelect.to);
    const markdown = blocks
      .map(({ node }) => BlockTypeRegistry.get(node.type.name)?.toMarkdown(node.toJSON() as TiptapNode))
      .filter((md): md is string => Boolean(md))
      .join('\n\n');
    if (markdown) {
      void navigator.clipboard.writeText(markdown);
      toast({ description: `${blocks.length} block${blocks.length === 1 ? '' : 's'} copied as Markdown` });
    }
    setMultiSelect(null);
  }, [editor, multiSelect]);

  const handleFilePick = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      const url = await uploadImage(file);
      editor?.chain().focus().setImage({ src: url }).run();
    },
    [editor, uploadImage],
  );

  if (!editor) return null;

  const contentRect = editor.view.dom.getBoundingClientRect();
  const selectedBlocks = multiSelect ? blocksInRange(editor.state.doc, multiSelect.from, multiSelect.to) : [];

  return (
    <div className="relative">
      <SaveStatus state={saveState} />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFilePick}
      />

      <BubbleMenu editor={editor} tippyOptions={{ duration: 100 }}>
        <SelectionToolbar editor={editor} pageId={pageId} />
      </BubbleMenu>

      <EditorContent editor={editor} className={fontClass} />

      {!locked && slash && filteredItems.length > 0 && (
        <SlashMenu items={filteredItems} slash={slash} editor={editor} onSelect={selectItem} onClose={() => setSlash(null)} />
      )}

      {blockHandle && (
        <BlockHandle
          handle={blockHandle}
          open={blockMenuOpen}
          onToggle={() => setBlockMenuOpen((v) => !v)}
          onDelete={deleteBlock}
          onDuplicate={duplicateBlock}
          onCopyLink={copyBlockLink}
          onCopyMarkdown={copyBlockMarkdown}
          onTurnInto={selectItem}
          items={items}
          onDragStart={() => {
            dragSourcePosRef.current = blockHandle.pos;
          }}
          onDragEnd={() => {
            dragSourcePosRef.current = null;
            setDropIndicatorTop(null);
          }}
        />
      )}

      {tableHandle && <TableToolbar editor={editor} handle={tableHandle} />}

      {dropIndicatorTop !== null && (
        <div
          className="pointer-events-none fixed z-40 h-0.5 rounded bg-blue-400"
          style={{ top: dropIndicatorTop, left: contentRect.left, width: contentRect.width }}
        />
      )}

      {/* Multi-block selection (§15) — a native mouse drag on this gutter strip to the
          left of the content, entirely outside the ProseMirror content DOM (never
          dnd-kit, never a ProseMirror decoration plugin — §CLAUDE.md/ADR-11). Dragging
          it computes a contiguous top-level block range via `blockPosAtCoords`, the same
          helper the drag-reorder drop indicator uses. */}
      <div
        data-testid="selection-gutter"
        className="fixed z-30 cursor-pointer"
        style={{ top: contentRect.top, left: contentRect.left - 40, width: 32, height: contentRect.height }}
        onMouseDown={(e) => {
          e.preventDefault();
          const anchor = blockPosAtCoords(editor.view, contentRect.left + 5, e.clientY);
          if (!anchor) return;
          setMultiSelect({ from: anchor.pos, to: anchor.pos });

          const onMove = (ev: MouseEvent) => {
            const current = blockPosAtCoords(editor.view, contentRect.left + 5, ev.clientY);
            if (current) setMultiSelect({ from: anchor.pos, to: current.pos });
          };
          const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
          };
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        }}
      />

      {selectedBlocks.length > 0 &&
        (() => {
          const firstDom = editor.view.nodeDOM(selectedBlocks[0].pos) as HTMLElement | null;
          const lastDom = editor.view.nodeDOM(selectedBlocks[selectedBlocks.length - 1].pos) as HTMLElement | null;
          if (!firstDom || !lastDom) return null;
          const firstRect = firstDom.getBoundingClientRect();
          const lastRect = lastDom.getBoundingClientRect();
          // Flip below the selection when there isn't room above (e.g. the page
          // title sits right there) instead of overlapping it.
          const toolbarTop = firstRect.top - 40 < 8 ? lastRect.bottom + 8 : firstRect.top - 40;
          return (
            <>
              <div
                className="pointer-events-none fixed z-30 rounded bg-blue-400/10 ring-2 ring-blue-400/40"
                style={{
                  top: firstRect.top,
                  left: contentRect.left,
                  width: contentRect.width,
                  height: lastRect.bottom - firstRect.top,
                }}
              />
              <div
                className="fixed z-40 flex items-center gap-1 rounded-lg bg-zinc-900 p-1 shadow-lg dark:bg-zinc-100"
                style={{ top: toolbarTop, left: contentRect.left }}
              >
                <span className="px-2 text-xs text-zinc-300 dark:text-zinc-600">
                  {selectedBlocks.length} block{selectedBlocks.length === 1 ? '' : 's'}
                </span>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={copyMultiSelectMarkdown}
                  className="rounded px-2 py-1 text-xs text-zinc-100 hover:bg-zinc-700 dark:text-zinc-800 dark:hover:bg-zinc-300"
                >
                  Copy as Markdown
                </button>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={deleteMultiSelect}
                  className="rounded px-2 py-1 text-xs text-red-300 hover:bg-zinc-700 dark:text-red-600 dark:hover:bg-zinc-300"
                >
                  Delete
                </button>
              </div>
            </>
          );
        })()}
    </div>
  );
}

/**
 * Selection toolbar (§15) — appears above a non-empty text selection via
 * Tiptap's `BubbleMenu` (positioning handled entirely by the library).
 */
function SelectionToolbar({ editor, pageId }: { editor: Editor; pageId: string }) {
  const [menu, setMenu] = useState<'text-color' | 'highlight' | 'link' | null>(null);

  const buttonCls = (active: boolean) =>
    `flex h-7 w-7 items-center justify-center rounded text-sm ${
      active
        ? 'bg-zinc-700 text-white dark:bg-zinc-200 dark:text-zinc-900'
        : 'text-zinc-100 hover:bg-zinc-700 dark:text-zinc-800 dark:hover:bg-zinc-300'
    }`;

  return (
    <div className="relative flex items-center gap-0.5 rounded-lg bg-zinc-900 p-1 shadow-lg dark:bg-zinc-100">
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={buttonCls(editor.isActive('bold'))}
        title="Bold"
      >
        B
      </button>
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`${buttonCls(editor.isActive('italic'))} italic`}
        title="Italic"
      >
        i
      </button>
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={`${buttonCls(editor.isActive('underline'))} underline`}
        title="Underline"
      >
        U
      </button>
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={`${buttonCls(editor.isActive('strike'))} line-through`}
        title="Strikethrough"
      >
        S
      </button>
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleCode().run()}
        className={`${buttonCls(editor.isActive('code'))} font-mono`}
        title="Code"
      >
        {'</>'}
      </button>
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleSubscript().run()}
        className={buttonCls(editor.isActive('subscript'))}
        title="Subscript"
      >
        x₂
      </button>
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleSuperscript().run()}
        className={buttonCls(editor.isActive('superscript'))}
        title="Superscript"
      >
        x²
      </button>
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setMenu((m) => (m === 'text-color' ? null : 'text-color'))}
        className={buttonCls(editor.isActive('textStyle') || menu === 'text-color')}
        title="Text color"
      >
        A
      </button>
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setMenu((m) => (m === 'highlight' ? null : 'highlight'))}
        className={buttonCls(editor.isActive('highlight') || menu === 'highlight')}
        title="Highlight color"
      >
        <span className="rounded-sm bg-yellow-300 px-0.5 text-zinc-900">H</span>
      </button>
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setMenu((m) => (m === 'link' ? null : 'link'))}
        className={buttonCls(editor.isActive('link') || menu === 'link')}
        title="Link"
      >
        🔗
      </button>

      {menu === 'text-color' && (
        <ColorSwatchMenu
          colors={MARK_COLORS}
          pick={(c) => c.fg}
          onSelect={(color) => {
            editor.chain().focus().setColor(color).run();
            setMenu(null);
          }}
          onClear={() => {
            editor.chain().focus().unsetColor().run();
            setMenu(null);
          }}
        />
      )}
      {menu === 'highlight' && (
        <ColorSwatchMenu
          colors={MARK_COLORS}
          pick={(c) => c.bg}
          onSelect={(color) => {
            editor.chain().focus().setHighlight({ color }).run();
            setMenu(null);
          }}
          onClear={() => {
            editor.chain().focus().unsetHighlight().run();
            setMenu(null);
          }}
        />
      )}
      {menu === 'link' && (
        <LinkMenu
          editor={editor}
          pageId={pageId}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

function ColorSwatchMenu({
  colors,
  pick,
  onSelect,
  onClear,
}: {
  colors: typeof MARK_COLORS;
  pick: (c: (typeof MARK_COLORS)[number]) => string;
  onSelect: (color: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="absolute left-0 top-full z-50 mt-1 flex w-48 flex-wrap gap-1 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClear}
        className="mb-1 w-full rounded px-2 py-1 text-left text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        Default
      </button>
      {colors.map((c) => (
        <button
          key={c.name}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelect(pick(c))}
          title={c.label}
          className="h-6 w-6 rounded-full border border-zinc-200 dark:border-zinc-700"
          style={{ backgroundColor: pick(c) }}
        />
      ))}
    </div>
  );
}

/** Link popover (§12A.2): a URL goes in as an external link (opens in a new
 * tab); anything else is treated as a page-title search and lists matches
 * from the already-fetched `['pages']` query — selecting one links to
 * `/{pageId}` with no `target`, so it navigates in the same tab via the
 * `handleClick` router.push wiring above. */
function LinkMenu({ editor, pageId, onClose }: { editor: Editor; pageId: string; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const { data: pages = [] } = useQuery({ queryKey: ['pages'], queryFn: api.listPages });

  const isUrl = /^https?:\/\/\S+$/.test(query.trim());
  const matches = isUrl
    ? []
    : pages
        .filter((p) => !p.isArchived && p.id !== pageId && p.title.toLowerCase().includes(query.trim().toLowerCase()))
        .slice(0, 6);

  const applyExternal = () => {
    const href = query.trim();
    if (!href) return;
    editor.chain().focus().extendMarkRange('link').setLink({ href, target: '_blank' }).run();
    onClose();
  };

  const applyInternal = (targetPageId: string) => {
    editor.chain().focus().extendMarkRange('link').setLink({ href: `/${targetPageId}`, target: null }).run();
    onClose();
  };

  return (
    <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && isUrl) applyExternal();
          if (e.key === 'Escape') onClose();
        }}
        placeholder="Paste a link or search pages…"
        className="w-full rounded border border-zinc-200 bg-transparent px-2 py-1 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:text-zinc-100"
      />
      {isUrl && (
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={applyExternal}
          className="mt-1 w-full rounded px-2 py-1 text-left text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Link to {query.trim()}
        </button>
      )}
      {!isUrl && query.trim() && matches.length === 0 && (
        <p className="mt-1 px-2 py-1 text-xs text-zinc-400">No matching pages</p>
      )}
      {!isUrl &&
        matches.map((p) => (
          <button
            key={p.id}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyInternal(p.id)}
            className="mt-1 flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <span>{p.icon ?? '📄'}</span>
            <span className="truncate">{p.title || 'Untitled'}</span>
          </button>
        ))}
      {editor.isActive('link') && (
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            editor.chain().focus().unsetLink().run();
            onClose();
          }}
          className="mt-1 w-full rounded px-2 py-1 text-left text-xs text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          Remove link
        </button>
      )}
    </div>
  );
}

function SaveStatus({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  const label = state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : 'Failed to save';
  const color = state === 'error' ? 'text-red-500' : 'text-zinc-400';
  // Pinned to the viewport rather than the editor box: the page header above
  // varies in height with the cover/icon, so an editor-relative badge would
  // land on the title on some pages and not others.
  return <div className={`fixed bottom-4 right-5 z-40 text-xs ${color}`}>{label}</div>;
}

function SlashMenu({
  items,
  slash,
  editor,
  onSelect,
  onClose,
}: {
  items: Array<{ title: string; hint: string; run: () => void }>;
  slash: SlashState;
  editor: Editor;
  onSelect: (run: () => void) => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);

  const coords = (() => {
    try {
      return editor.view.coordsAtPos(slash.from);
    } catch {
      return null;
    }
  })();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIndex((i) => (i + 1) % items.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIndex((i) => (i - 1 + items.length) % items.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onSelect(items[index]?.run ?? (() => {}));
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, index, onSelect, onClose]);

  return (
    <div
      className="fixed z-50 max-h-72 w-56 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
      style={coords ? { top: coords.top + 20, left: coords.left } : { top: 0, left: 0 }}
    >
      {items.map((item, i) => (
        <button
          key={item.title}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelect(item.run)}
          onMouseEnter={() => setIndex(i)}
          className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm ${
            i === index ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-300'
          }`}
        >
          <span>{item.title}</span>
          <span className="text-xs text-zinc-400">{item.hint}</span>
        </button>
      ))}
    </div>
  );
}

/** Row/column menu (§12B.1's "table block ... + menu baris/kolom") — a small
 * fixed toolbar above whichever table the cursor is in, wired straight to
 * `@tiptap/extension-table`'s built-in commands (no bespoke table-editing
 * logic of our own). */
function TableToolbar({ editor, handle }: { editor: Editor; handle: TableHandleState }) {
  const btnCls =
    'rounded px-2 py-1 text-xs text-zinc-100 hover:bg-zinc-700 dark:text-zinc-800 dark:hover:bg-zinc-300';
  return (
    <div
      className="fixed z-40 flex items-center gap-0.5 rounded-lg bg-zinc-900 p-1 shadow-lg dark:bg-zinc-100"
      style={{ top: handle.top - 40, left: handle.left, width: handle.width }}
    >
      <button onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().addRowBefore().run()} className={btnCls} title="Insert row above">
        +Row↑
      </button>
      <button onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().addRowAfter().run()} className={btnCls} title="Insert row below">
        +Row↓
      </button>
      <button onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().deleteRow().run()} className={btnCls} title="Delete row">
        −Row
      </button>
      <span className="mx-0.5 h-4 w-px bg-zinc-700 dark:bg-zinc-300" />
      <button onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().addColumnBefore().run()} className={btnCls} title="Insert column before">
        +Col←
      </button>
      <button onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().addColumnAfter().run()} className={btnCls} title="Insert column after">
        +Col→
      </button>
      <button onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().deleteColumn().run()} className={btnCls} title="Delete column">
        −Col
      </button>
      <span className="mx-0.5 h-4 w-px bg-zinc-700 dark:bg-zinc-300" />
      <button onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleHeaderRow().run()} className={btnCls} title="Toggle header row">
        Header
      </button>
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().deleteTable().run()}
        className={`${btnCls} text-red-300 dark:text-red-600`}
        title="Delete table"
      >
        Delete table
      </button>
    </div>
  );
}

function BlockHandle({
  handle,
  open,
  onToggle,
  onDelete,
  onDuplicate,
  onCopyLink,
  onCopyMarkdown,
  onTurnInto,
  items,
  onDragStart,
  onDragEnd,
}: {
  handle: BlockHandleState;
  open: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onCopyLink: () => void;
  onCopyMarkdown: () => void;
  onTurnInto: (run: () => void) => void;
  items: Array<{ title: string; hint: string; run: () => void }>;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <>
      {/* `coordsAtPos` returns viewport coordinates, so the handle must be
          `fixed` — positioning it absolutely inside the editor made it drift
          by whatever the page header above happened to be tall. Draggable: this
          is a native HTML5 drag from an element outside the ProseMirror content
          DOM, dropped back in via `editorProps.handleDrop` (§CLAUDE.md, ADR-11
          — dnd-kit is never mounted inside ProseMirror content). */}
      <button
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onToggle}
        className="fixed z-40 flex h-6 w-6 cursor-grab items-center justify-center rounded text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        style={{ top: handle.top, left: handle.left - 32 }}
        title="Block menu — drag to reorder"
      >
        ⋮⋮
      </button>

      {open && (
        <div
          className="fixed z-50 w-44 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
          style={{ top: handle.top + 24, left: handle.left - 32 }}
        >
          {items.slice(0, 5).map((item) => (
            <button
              key={item.title}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onTurnInto(item.run)}
              className="block w-full rounded px-2 py-1 text-left text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {item.title}
            </button>
          ))}
          <div className="my-1 border-t border-zinc-200 dark:border-zinc-700" />
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={onDuplicate}
            className="block w-full rounded px-2 py-1 text-left text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Duplicate
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={onCopyLink}
            className="block w-full rounded px-2 py-1 text-left text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Copy link to block
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={onCopyMarkdown}
            className="block w-full rounded px-2 py-1 text-left text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Copy as Markdown
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={onDelete}
            className="block w-full rounded px-2 py-1 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            Delete
          </button>
        </div>
      )}
    </>
  );
}

export { DocumentEditor };
